import { and, eq, gte, lt, sql } from 'drizzle-orm';
import type { BaselineConfig } from '@/lib/data/baselines';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { classifyBatch } from '@/lib/services/functional-classifier';
import type { BaselineDistribution, FunctionalBucket, WeekMetadata } from '@/lib/types/structural';
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
  };
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
