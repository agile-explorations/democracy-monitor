import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { ACTIVE_SOURCES, T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents, narrativeFailures, weeklyAggregates } from '@/lib/db/schema';
import type {
  MultiPassNarrativeResult,
  NarrativeLayerData,
  NarrativeResult,
  TermSummaryInput,
  WeeklySummaryInput,
} from '@/lib/types';
import { OVERVIEW_CATEGORY, TERM_SUMMARY_CATEGORY } from '@/lib/types';
import type { ConcernAssessment, StructuralScore } from '@/lib/types/structural';
import { formatError } from '@/lib/utils/api-helpers';
import { recordFailure, resolveFailure } from './narrative-failure-store';
import {
  buildStableTemplate,
  isElevatedStatus,
  needsMultiPass,
} from './narrative-generation-service';
import {
  generateMultiPassNarrative,
  generateMultiPassSummary,
  generateSinglePassNarrative,
} from './narrative-multipass';
import {
  buildTermSummaryDraftPrompt,
  buildTermSummaryFeedbackPrompt,
  buildTermSummaryRevisionPrompt,
  buildWeeklySummaryDraftPrompt,
  buildWeeklySummaryFeedbackPrompt,
  buildWeeklySummaryRevisionPrompt,
} from './narrative-prompts';
import {
  countL2AssessmentsForCategoryWeek,
  enrichCategoryData,
  getPreviousWeekNarrative,
  getTermNarrative,
  getTermStatistics,
  getTotalDocumentCount,
  getTrajectoryTable,
} from './narrative-queries';
import {
  deleteNarrativeDrafts,
  storeMultiPassNarratives,
  storeNarratives,
} from './narrative-store';

/**
 * Minimum ratio of aggregated categories to actual document categories.
 * If weekly_aggregates covers fewer than this fraction of categories that have
 * documents, narratives are aborted to prevent false signals from stale data.
 */
const MIN_CATEGORY_COVERAGE = 0.5;

/** Check whether weekly_aggregates is reasonably complete for a given week. */
async function checkAggregateCompleteness(weekOf: string): Promise<{
  ok: boolean;
  docCategories: number;
  aggCategories: number;
  message?: string;
}> {
  const db = getDb();
  const nextWeek = new Date(weekOf);
  nextWeek.setDate(nextWeek.getDate() + 7);
  const nextWeekStr = nextWeek.toISOString().slice(0, 10);

  const docRows = await db
    .select({ category: documents.category, count: sql<number>`count(*)` })
    .from(documents)
    .where(
      and(
        gte(documents.publishedAt, new Date(weekOf)),
        lt(documents.publishedAt, new Date(nextWeekStr)),
        sql`${documents.contentType} != 'metadata_only'`,
        sql`${documents.sourceOrigin} IN (${sql.join(
          [...ACTIVE_SOURCES].map((s) => sql`${s}`),
          sql`, `,
        )})`,
      ),
    )
    .groupBy(documents.category);

  const aggRows = await db
    .select({ category: weeklyAggregates.category })
    .from(weeklyAggregates)
    .where(eq(weeklyAggregates.weekOf, weekOf));

  const docCategories = docRows.length;
  const aggCategories = aggRows.length;

  if (docCategories === 0) {
    return { ok: true, docCategories: 0, aggCategories };
  }

  const coverage = aggCategories / docCategories;
  if (coverage < MIN_CATEGORY_COVERAGE) {
    return {
      ok: false,
      docCategories,
      aggCategories,
      message:
        `weekly_aggregates covers ${aggCategories}/${docCategories} categories ` +
        `(${(coverage * 100).toFixed(0)}%). Run scores:recompute and scores:enrich ` +
        `for this week before generating narratives.`,
    };
  }

  return { ok: true, docCategories, aggCategories };
}

/** Convert a weekly_aggregates row to NarrativeLayerData. */
export function toNarrativeLayerData(
  cat: { key: string; title: string; description: string },
  row: typeof weeklyAggregates.$inferSelect,
): NarrativeLayerData {
  return {
    category: cat.key,
    categoryTitle: cat.title,
    categoryDescription: cat.description,
    weekOf: String(row.weekOf),
    structuralScore: row.structuralScore,
    structuralDetail: row.structuralDetail as StructuralScore | null,
    aiScore: row.aiScore,
    aiDetail: row.aiDetail as NarrativeLayerData['aiDetail'],
    thematicScore: row.thematicScore,
    thematicDetail: row.thematicDetail as NarrativeLayerData['thematicDetail'],
    convergenceScore: row.convergenceScore,
    convergenceDetail: row.convergenceDetail as ConcernAssessment | null,
    totalDocumentCount: row.documentCount,
  };
}

/** Load layer data for all categories for a given week. */
export async function loadAllLayerData(weekOf: string): Promise<NarrativeLayerData[]> {
  const db = getDb();
  const results: NarrativeLayerData[] = [];

  for (const cat of CATEGORIES) {
    const rows = await db
      .select()
      .from(weeklyAggregates)
      .where(and(eq(weeklyAggregates.category, cat.key), eq(weeklyAggregates.weekOf, weekOf)))
      .limit(1);

    const row = rows[0];
    if (!row) continue;
    results.push(toNarrativeLayerData(cat, row));
  }

  return results;
}

/** Generate weekly cross-category summary (replaces _overview) via 3-pass pipeline. */
async function generateWeeklySummary(input: WeeklySummaryInput): Promise<MultiPassNarrativeResult> {
  return generateMultiPassSummary(
    'weekly summary',
    () => buildWeeklySummaryDraftPrompt(input),
    (expert, pub) => buildWeeklySummaryFeedbackPrompt(expert, pub, input),
    (expert, pub, feedback) => buildWeeklySummaryRevisionPrompt(expert, pub, feedback, input),
  );
}

/** Generate incremental term summary (_term_summary) via 3-pass pipeline. */
async function generateTermSummary(input: TermSummaryInput): Promise<MultiPassNarrativeResult> {
  return generateMultiPassSummary(
    'term summary',
    () => buildTermSummaryDraftPrompt(input),
    (expert, pub) => buildTermSummaryFeedbackPrompt(expert, pub, input),
    (expert, pub, feedback) => buildTermSummaryRevisionPrompt(expert, pub, feedback, input),
  );
}

/**
 * True when convergence is elevated AND the category actually has docs/L2 in the DB.
 * An elevated score with no underlying data means the aggregate is stale and AI
 * generation would hallucinate against empty input — force the stable path instead.
 */
async function effectivelyElevated(data: NarrativeLayerData, weekOf: string): Promise<boolean> {
  if (!isElevatedStatus(data.convergenceDetail)) return false;
  const [docCount, l2Count] = await Promise.all([
    getTotalDocumentCount(data.category, weekOf),
    countL2AssessmentsForCategoryWeek(data.category, weekOf),
  ]);
  if (docCount === 0 && l2Count === 0) {
    console.warn(
      `[narratives]   ${data.category}: forcing stable template — elevated convergence but 0 docs / 0 L2 (stale aggregates)`,
    );
    return false;
  }
  return true;
}

/** Phase 1: Generate per-category narratives (stable templates + multi-pass for elevated). */
async function generateCategoryNarratives(
  categories: NarrativeLayerData[],
  weekOf: string,
): Promise<{ narratives: Map<string, { expert: string; public: string }>; failed: string[] }> {
  const narratives = new Map<string, { expert: string; public: string }>();
  const failed: string[] = [];

  for (const data of categories) {
    const elevated = await effectivelyElevated(data, weekOf);

    if (!elevated) {
      const template = buildStableTemplate(data.categoryTitle, data.weekOf);
      await storeNarratives(data.category, weekOf, template);
      // Clean up orphan multi-pass artifacts from a prior elevated run for this week.
      await deleteNarrativeDrafts(data.category, weekOf);
      narratives.set(data.category, { expert: template.expert, public: template.public });
      continue;
    }
    try {
      await enrichCategoryData(data);
      const multiPass = needsMultiPass(data.convergenceDetail);
      if (multiPass) {
        const result = await generateMultiPassNarrative(data);
        await storeMultiPassNarratives(data.category, weekOf, result);
        narratives.set(data.category, { expert: result.expert, public: result.public });
      } else {
        const result = await generateSinglePassNarrative(data);
        await storeNarratives(data.category, weekOf, result);
        // Single-pass elevated path doesn't produce drafts — clear any stale ones.
        await deleteNarrativeDrafts(data.category, weekOf);
        narratives.set(data.category, { expert: result.expert, public: result.public });
      }
      await resolveFailure(data.category, weekOf);
      console.log(
        `[narratives]   ${data.category}: stored ${multiPass ? '3-pass' : 'single-pass'} (docs=${data.documentContext?.length ?? 0})`,
      );
    } catch (err) {
      const passInfo = (err as { passInfo?: { pass: number } }).passInfo;
      const pass = passInfo?.pass ?? 0;
      const msg = formatError(err);
      await recordFailure(data.category, weekOf, pass, msg);
      failed.push(data.category);
      console.error(`[narratives]   ${data.category}: failed at pass ${pass}: ${msg}`);
    }
  }

  return { narratives, failed };
}

/** Phase 2+3: Generate weekly summary and incremental term summary. */
async function generateSummaries(
  weekOf: string,
  categories: NarrativeLayerData[],
  categoryNarratives: Map<string, { expert: string; public: string }>,
  failedCategories: string[],
): Promise<void> {
  const previousWeekSummary = await getPreviousWeekNarrative(weekOf);
  const weeklyInput: WeeklySummaryInput = {
    weekOf,
    categories,
    categoryNarratives,
    failedCategories,
    previousWeekSummary,
  };
  const weeklyResult = await generateWeeklySummary(weeklyInput);
  await storeMultiPassNarratives(OVERVIEW_CATEGORY, weekOf, weeklyResult);
  console.log('[narratives]   weekly summary: stored (3-pass)');

  try {
    const [previousTermSummary, trajectoryTable, statistics] = await Promise.all([
      getTermNarrative(),
      getTrajectoryTable(T2_INAUGURATION, weekOf),
      getTermStatistics(T2_INAUGURATION, weekOf),
    ]);
    const termInput: TermSummaryInput = {
      weekOf,
      weeklySummary: { expert: weeklyResult.expert, public: weeklyResult.public },
      previousTermSummary,
      trajectoryTable,
      statistics,
    };
    const termResult = await generateTermSummary(termInput);
    await storeMultiPassNarratives(TERM_SUMMARY_CATEGORY, weekOf, termResult);
    console.log('[narratives]   term summary: stored (3-pass)');
  } catch (err) {
    console.error('[narratives]   term summary: failed:', err);
  }
}

/**
 * Generate and store narratives for all categories in a given week,
 * plus a weekly summary and incremental term summary.
 *
 * Cascade: category narratives (multi-pass) → weekly summary → term summary.
 */
export async function generateNarrativesForWeek(weekOf: string): Promise<void> {
  if (!isDbAvailable()) {
    console.log('[narratives] Skipping — database not available');
    return;
  }

  console.log(`[narratives] Generating narratives for week ${weekOf}...`);

  const completeness = await checkAggregateCompleteness(weekOf);
  if (!completeness.ok) {
    console.error(`[narratives] ABORTING — stale data: ${completeness.message}`);
    return;
  }
  if (completeness.docCategories > 0) {
    console.log(
      `[narratives] Data check: ${completeness.aggCategories}/${completeness.docCategories} categories aggregated`,
    );
  }

  const categories = await loadAllLayerData(weekOf);

  if (categories.length === 0) {
    console.log('[narratives] No weekly aggregate data found — skipping');
    return;
  }

  const elevated = categories.filter((c) => isElevatedStatus(c.convergenceDetail));
  console.log(`[narratives] ${elevated.length} of ${categories.length} categories elevated`);

  const { narratives: categoryNarratives, failed: failedCategories } =
    await generateCategoryNarratives(categories, weekOf);

  try {
    await generateSummaries(weekOf, categories, categoryNarratives, failedCategories);
  } catch (err) {
    console.error('[narratives]   weekly summary: failed:', err);
  }

  console.log(
    `[narratives] Done — ${categoryNarratives.size} category narratives (${failedCategories.length} failed), weekly + term summaries`,
  );
}

/**
 * Retry unresolved narrative failures for a specific week.
 * Optionally filter to a single category. Returns { resolved, failed }.
 */
export async function retryFailedNarratives(
  weekOf: string,
  category?: string,
): Promise<{ resolved: number; failed: number }> {
  if (!isDbAvailable()) return { resolved: 0, failed: 0 };
  const db = getDb();

  const conditions = [eq(narrativeFailures.weekOf, weekOf), isNull(narrativeFailures.resolvedAt)];
  if (category) conditions.push(eq(narrativeFailures.category, category));

  const failures = await db
    .select()
    .from(narrativeFailures)
    .where(and(...conditions));

  if (failures.length === 0) return { resolved: 0, failed: 0 };

  const allData = await loadAllLayerData(weekOf);
  const dataMap = new Map(allData.map((d) => [d.category, d]));
  let resolved = 0;
  let failed = 0;

  for (const failure of failures) {
    const data = dataMap.get(failure.category);
    if (!data) {
      failed++;
      continue;
    }

    if (!isElevatedStatus(data.convergenceDetail)) {
      await resolveFailure(failure.category, weekOf);
      resolved++;
      continue;
    }

    try {
      await enrichCategoryData(data);
      const result = await generateMultiPassNarrative(data);
      await storeMultiPassNarratives(failure.category, weekOf, result);
      await resolveFailure(failure.category, weekOf);
      resolved++;
    } catch (err) {
      const passInfo = (err as { passInfo?: { pass: number } }).passInfo;
      await recordFailure(failure.category, weekOf, passInfo?.pass ?? 0, formatError(err));
      failed++;
    }
  }

  return { resolved, failed };
}
