import { and, eq, gte, lt, sql } from 'drizzle-orm';
import type { BaselineConfig } from '@/lib/data/baselines';
import { getDb, isDbAvailable } from '@/lib/db';
import { retrievalRelevantOnly } from '@/lib/db/document-filters';
import { documents } from '@/lib/db/schema';
import { classifyBatch } from '@/lib/services/functional-classifier';
import { jensenShannonDivergence } from '@/lib/services/structural-anomaly-service';
import type {
  BaselineDistribution,
  FunctionalBucket,
  JsdStat,
  WeekMetadata,
} from '@/lib/types/structural';
import { addDays, getMonday } from '@/lib/utils/date-utils';
import { mean, stddev } from '@/lib/utils/math';

/** Fallback label for documents with no agency metadata. */
const UNKNOWN_AGENCY = 'unknown';

interface DocumentRow {
  sourceType: string;
  title: string;
  action: string | null;
  agency: string | null;
  publishedAt: Date | null;
  caseId?: string | null;
}

/**
 * Extract week metadata from documents in the database for a given category and week.
 */
export async function extractWeekMetadata(
  category: string,
  weekOf: string,
): Promise<WeekMetadata | null> {
  if (!isDbAvailable()) return null;

  const db = getDb();
  const weekEnd = addDays(weekOf, 7);

  const rows = await db
    .select({
      sourceType: documents.sourceType,
      title: documents.title,
      action: sql<string | null>`${documents.metadata}->>'action'`,
      agency: sql<string | null>`${documents.metadata}->>'agency'`,
      publishedAt: documents.publishedAt,
      caseId: documents.caseId,
    })
    .from(documents)
    .where(
      and(
        eq(documents.category, category),
        gte(documents.publishedAt, new Date(weekOf)),
        lt(documents.publishedAt, new Date(weekEnd)),
        retrievalRelevantOnly(),
      ),
    );

  if (rows.length === 0) return null;

  return buildWeekMetadata(category, weekOf, rows);
}

/** Build WeekMetadata from a set of document rows. Pure function. */
export function buildWeekMetadata(
  category: string,
  weekOf: string,
  rows: DocumentRow[],
): WeekMetadata {
  const typeDistribution = computeDistribution(rows.map((r) => r.sourceType));

  const classifiableDocs = rows.map((r) => ({
    title: r.title,
    sourceType: r.sourceType,
    action: r.action ?? undefined,
  }));
  const functionalDistribution = classifyBatch(classifiableDocs);

  const agencyDistribution = computeDistribution(
    rows.map((r) => r.agency ?? UNKNOWN_AGENCY).filter(Boolean),
  );

  const dailyCounts = computeDailyCounts(
    weekOf,
    rows.map((r) => r.publishedAt),
  );

  const sourceConvergenceRatio = computeSourceConvergenceRatio(rows);

  // Deduplicate by case_id for CL documents (docket + opinion = one case)
  const documentCount = new Set(rows.map((r) => r.caseId ?? r.title)).size;

  return {
    category,
    weekOf,
    documentCount,
    typeDistribution,
    functionalDistribution,
    agencyDistribution,
    dailyCounts,
    sourceConvergenceRatio,
  };
}

/**
 * Compute baseline structural distributions for a category across a baseline period.
 */
export async function computeBaselineStructuralDistribution(
  config: BaselineConfig,
  category: string,
): Promise<BaselineDistribution | null> {
  if (!isDbAvailable()) return null;

  const db = getDb();

  const rows = await db
    .select({
      sourceType: documents.sourceType,
      title: documents.title,
      action: sql<string | null>`${documents.metadata}->>'action'`,
      agency: sql<string | null>`${documents.metadata}->>'agency'`,
      publishedAt: documents.publishedAt,
      caseId: documents.caseId,
    })
    .from(documents)
    .where(
      and(
        eq(documents.category, category),
        gte(documents.publishedAt, new Date(config.from)),
        lt(documents.publishedAt, new Date(config.to)),
        retrievalRelevantOnly(),
      ),
    );

  if (rows.length === 0) return null;

  return buildBaselineDistribution(config, category, rows);
}

/** Build baseline distribution from document rows. Pure function. */
export function buildBaselineDistribution(
  config: BaselineConfig,
  category: string,
  rows: DocumentRow[],
): BaselineDistribution {
  const typeDistribution = computeDistribution(rows.map((r) => r.sourceType));

  const classifiableDocs = rows.map((r) => ({
    title: r.title,
    sourceType: r.sourceType,
    action: r.action ?? undefined,
  }));
  const functionalDistribution = classifyBatch(classifiableDocs);

  const agencyDistribution = computeDistribution(
    rows.map((r) => r.agency ?? UNKNOWN_AGENCY).filter(Boolean),
  );

  // Compute weekly stats for mean/stddev
  const weeklyGroups = groupByWeek(rows);
  const weeklyCounts = Object.values(weeklyGroups).map((g) => g.length);
  const weeklyDailyVariances = Object.entries(weeklyGroups).map(([weekStart, weekRows]) => {
    const daily = computeDailyCounts(
      weekStart,
      weekRows.map((r) => r.publishedAt),
    );
    return computeVarianceValue(daily);
  });

  const weeklySourceRatios = Object.values(weeklyGroups).map((weekRows) =>
    computeSourceConvergenceRatio(weekRows),
  );

  const jsdStats = computeWeeklyJsdStats(weeklyGroups, {
    typeDistribution,
    functionalDistribution,
    agencyDistribution,
  });

  return {
    baselineId: config.id,
    category,
    meanDocCount: mean(weeklyCounts),
    stdDevDocCount: stddev(weeklyCounts),
    typeDistribution,
    functionalDistribution,
    agencyDistribution,
    meanDailyVariance: mean(weeklyDailyVariances),
    stdDevDailyVariance: stddev(weeklyDailyVariances),
    meanSourceConvergenceRatio: mean(weeklySourceRatios),
    stdDevSourceConvergenceRatio: stddev(weeklySourceRatios),
    jsdStats,
  };
}

/**
 * Guard against near-zero empirical spread producing runaway z-scores; the
 * floor is deliberately far below normal weekly JSD variation (~0.05–0.15).
 */
const JSD_STD_FLOOR = 0.01;

/**
 * Empirical per-dimension JSD baseline stats (#573): each baseline week's
 * divergence from the baseline aggregate distribution, summarized as
 * mean/std. This is what "normal weekly divergence" actually looks like for
 * the category — the reference the current week's JSD is z-scored against.
 */
export function computeWeeklyJsdStats(
  weeklyGroups: Record<string, DocumentRow[]>,
  aggregate: {
    typeDistribution: Record<string, number>;
    functionalDistribution: Record<FunctionalBucket, number>;
    agencyDistribution: Record<string, number>;
  },
): { type: JsdStat; functional: JsdStat; agency: JsdStat } {
  const typeJsds: number[] = [];
  const funcJsds: number[] = [];
  const agencyJsds: number[] = [];

  for (const weekRows of Object.values(weeklyGroups)) {
    typeJsds.push(
      jensenShannonDivergence(
        computeDistribution(weekRows.map((r) => r.sourceType)),
        aggregate.typeDistribution,
      ),
    );
    funcJsds.push(
      jensenShannonDivergence(
        classifyBatch(
          weekRows.map((r) => ({
            title: r.title,
            sourceType: r.sourceType,
            action: r.action ?? undefined,
          })),
        ) as Record<string, number>,
        aggregate.functionalDistribution as Record<string, number>,
      ),
    );
    agencyJsds.push(
      jensenShannonDivergence(
        computeDistribution(weekRows.map((r) => r.agency ?? UNKNOWN_AGENCY).filter(Boolean)),
        aggregate.agencyDistribution,
      ),
    );
  }

  const stat = (values: number[]): JsdStat => ({
    mean: mean(values),
    std: Math.max(stddev(values), JSD_STD_FLOOR),
  });
  return { type: stat(typeJsds), functional: stat(funcJsds), agency: stat(agencyJsds) };
}

/** Document types that indicate government-origin documents. */
const GOVERNMENT_DOC_TYPES = new Set([
  'Notice',
  'Rule',
  'Proposed Rule',
  'Presidential Document',
  'executive_order',
  'presidential_memorandum',
  'proclamation',
  'presidential_notice',
  'final_rule',
  'proposed_rule',
  'notice',
  'court_opinion',
  'docket_entry',
  'judicial_opinion',
  'press_release',
  'gao_report',
  'congressional_report',
  'public_law',
  'advisory_opinion',
  'enforcement_action',
  'admin_fine',
]);

/**
 * Compute the ratio of government (FR-type) docs to rhetoric (GDELT/WH) docs.
 * Returns 0 when no docs exist, approaches Infinity when all docs are government.
 * Uses a log-smoothed ratio: log2((gov + 1) / (rhetoric + 1)) to handle zero denominators.
 */
export function computeSourceConvergenceRatio(rows: DocumentRow[]): number {
  let govCount = 0;
  let rhetoricCount = 0;

  for (const row of rows) {
    if (GOVERNMENT_DOC_TYPES.has(row.sourceType)) {
      govCount++;
    } else if (row.sourceType === 'rhetoric') {
      rhetoricCount++;
    }
  }

  return Math.log2((govCount + 1) / (rhetoricCount + 1));
}

/** Compute proportional distribution from a list of string values. */
function computeDistribution(values: string[]): Record<string, number> {
  if (values.length === 0) return {};
  const counts: Record<string, number> = {};
  for (const v of values) {
    counts[v] = (counts[v] ?? 0) + 1;
  }
  const total = values.length;
  const dist: Record<string, number> = {};
  for (const [k, c] of Object.entries(counts)) {
    dist[k] = c / total;
  }
  return dist;
}

/** Compute daily document counts for a 7-day week starting at weekOf. */
function computeDailyCounts(weekOf: string, dates: (Date | null)[]): number[] {
  const counts = new Array(7).fill(0);
  const weekStart = new Date(weekOf);

  for (const d of dates) {
    if (!d) continue;
    const dayOffset = Math.floor((d.getTime() - weekStart.getTime()) / (24 * 60 * 60 * 1000));
    if (dayOffset >= 0 && dayOffset < 7) {
      counts[dayOffset]++;
    }
  }

  return counts;
}

function computeVarianceValue(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  return values.reduce((s, v) => s + (v - avg) ** 2, 0) / values.length;
}

/** Group document rows by week (Monday-based). */
function groupByWeek(rows: DocumentRow[]): Record<string, DocumentRow[]> {
  const groups: Record<string, DocumentRow[]> = {};
  for (const row of rows) {
    if (!row.publishedAt) continue;
    const weekStart = getMonday(row.publishedAt);
    if (!groups[weekStart]) groups[weekStart] = [];
    groups[weekStart].push(row);
  }
  return groups;
}
