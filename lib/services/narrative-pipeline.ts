import { and, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import { getProvider } from '@/lib/ai/provider';
import { ACTIVE_SOURCES, T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents, narrativeFailures, weeklyAggregates } from '@/lib/db/schema';
import type {
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
import { generateMultiPassNarrative, generateSinglePassNarrative } from './narrative-multipass';
import { buildTermSummaryPrompt, buildWeeklySummaryPrompt } from './narrative-prompts';
import {
  enrichCategoryData,
  getPreviousWeekNarrative,
  getTermNarrative,
  getTermStatistics,
  getTrajectoryTable,
} from './narrative-queries';
import { storeMultiPassNarratives, storeNarratives } from './narrative-store';

const SUMMARY_MODEL = 'claude-opus-4-6';

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

/** Generate a single-pass summary narrative (expert or public). */
async function generateSinglePass(
  prompt: string,
  systemPrompt: string,
  maxTokens: number,
): Promise<string> {
  const claude = getProvider('anthropic');
  if (!claude.isAvailable()) throw new Error('Anthropic API key not configured');
  const result = await claude.complete(prompt, { model: SUMMARY_MODEL, maxTokens, systemPrompt });
  return result.content;
}

/** Generate weekly cross-category summary (replaces _overview). */
async function generateWeeklySummary(input: WeeklySummaryInput): Promise<NarrativeResult> {
  const systemPrompt =
    'You are an expert analyst for a democratic institution monitoring system. ' +
    'You produce rigorous, evidence-based cross-category synthesis.';

  const [expert, pub] = await Promise.all([
    generateSinglePass(buildWeeklySummaryPrompt(input, 'expert'), systemPrompt, 2048),
    generateSinglePass(buildWeeklySummaryPrompt(input, 'public'), systemPrompt, 1024),
  ]);
  return { expert, public: pub, model: SUMMARY_MODEL };
}

/** Generate incremental term summary (_term_summary). */
async function generateTermSummary(input: TermSummaryInput): Promise<NarrativeResult> {
  const systemPrompt =
    'You are an expert analyst for a democratic institution monitoring system. ' +
    'You produce rigorous, evidence-based term-level synthesis.';

  const [expert, pub] = await Promise.all([
    generateSinglePass(buildTermSummaryPrompt(input, 'expert'), systemPrompt, 4096),
    generateSinglePass(buildTermSummaryPrompt(input, 'public'), systemPrompt, 2048),
  ]);
  return { expert, public: pub, model: SUMMARY_MODEL };
}

/** Phase 1: Generate per-category narratives (stable templates + multi-pass for elevated). */
async function generateCategoryNarratives(
  categories: NarrativeLayerData[],
  weekOf: string,
): Promise<{ narratives: Map<string, { expert: string; public: string }>; failed: string[] }> {
  const narratives = new Map<string, { expert: string; public: string }>();
  const failed: string[] = [];

  for (const data of categories) {
    if (!isElevatedStatus(data.convergenceDetail)) {
      const template = buildStableTemplate(data.categoryTitle, data.weekOf);
      await storeNarratives(data.category, weekOf, template);
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
  await storeNarratives(OVERVIEW_CATEGORY, weekOf, weeklyResult);
  console.log('[narratives]   weekly summary: stored');

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
    await storeNarratives(TERM_SUMMARY_CATEGORY, weekOf, termResult);
    console.log('[narratives]   term summary: stored');
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
