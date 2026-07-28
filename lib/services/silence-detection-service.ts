import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { countingEligible } from '@/lib/db/document-filters';
import { documents } from '@/lib/db/schema';

/**
 * Source origin classification for silence detection.
 *
 * Government-controlled: sources whose output is determined by executive branch decisions.
 * When these go silent, the absence may reflect deliberate information suppression.
 *
 * Independent-branch: congressional, judicial, and legislative-branch oversight sources
 * whose output is not controlled by the executive. Continued activity in these sources
 * while government sources are silent creates the contrast signal that L1v2 detects.
 *
 * Note: `govinfo` publishes congressional reports (CRPT) and public laws (PLAW) —
 * legislative-branch outputs. It does NOT carry current GAO material (the
 * GAOREPORTS collection is a dead pre-2008 archive; see #529). `govinfo_cpd`
 * (Presidential Documents) is separate and correctly classified as
 * government-controlled.
 */
export const GOVERNMENT_SOURCES = new Set(['federal_register', 'doj', 'govinfo_cpd', 'oig', 'fec']);

export const INDEPENDENT_SOURCES = new Set(['courtlistener', 'crec', 'legiscan', 'govinfo']);

/** Rolling window size for intra-admin baseline (weeks). */
const ROLLING_WINDOW_SIZE = 8;
/** Minimum weeks of data required before silence detection is meaningful. */
const MIN_WINDOW_SIZE = 4;
/** Government volume z-score threshold for silence (1.5σ below mean). */
export const SILENCE_Z_THRESHOLD = 1.5;

/**
 * Sparse-source mode (#546): below this true weekly mean (zero weeks
 * included), weekly z-scores are Poisson noise — switch to a presence-rate /
 * zero-streak test over a longer window. Post-#544, four categories run at
 * ~1–2 gov docs/week (hatch, elections, mediaFreedom, judicialIndependence).
 */
export const SPARSE_VOLUME_FLOOR = 3;
/** Longer window for the sparse presence-rate test (admin-clamped). */
const SPARSE_WINDOW_WEEKS = 16;
/** Minimum historical presence rate for silence to be meaningful at all. */
export const SPARSE_MIN_PRESENCE = 0.5;
/** Zero-streak improbability threshold: conspicuous when (1-p)^k < this. */
export const SPARSE_STREAK_P = 0.05;

export interface SilenceScore {
  /** Government-source doc count this week */
  govDocCount: number;
  /** Independent-source doc count this week */
  independentDocCount: number;
  /** Rolling mean of gov doc count (past N weeks, same admin) */
  rollingGovMean: number;
  /** Rolling stddev of gov doc count */
  rollingGovStdDev: number;
  /** Z-score: how far below the rolling mean (positive = quieter than usual) */
  govSilenceZ: number;
  /** Composite silence score: govSilenceZ * log-scaled independent activity */
  silenceScore: number;
  /** Whether silence is conspicuous (gov quiet + independent active) */
  conspicuous: boolean;
  /** Rolling window size used */
  windowSize: number;
  /** True if below MIN_WINDOW_SIZE (score is low-confidence) */
  coldStart: boolean;
  /** Which statistical test produced conspicuous/silenceScore (#546). */
  mode: 'zscore' | 'sparse';
  /** Sparse mode only: share of window weeks with ≥1 gov doc. */
  presenceRate?: number;
  /** Sparse mode only: consecutive zero-gov weeks ending at this week. */
  zeroStreak?: number;
  /** Sparse mode only: human-readable note on why the test switched. */
  coverageNote?: string;
}

/**
 * Compute a silence detection score for a category-week.
 *
 * Measures whether government-controlled sources have gone unusually quiet
 * while independent-branch sources remain active. Uses an intra-admin rolling
 * window (not cross-admin baselines) to establish "normal" government volume.
 *
 * Returns null if no data is available or database is not connected.
 */
export async function computeSilenceScore(
  category: string,
  weekOf: string,
): Promise<SilenceScore | null> {
  if (!isDbAvailable()) return null;

  const [currentWeek, rollingWindow, sparseSeries] = await Promise.all([
    getWeekSourceCounts(category, weekOf),
    getRollingGovCounts(category, weekOf),
    getRollingGovSeries(category, weekOf, SPARSE_WINDOW_WEEKS),
  ]);

  if (!currentWeek) return null;

  const govDocCount = currentWeek.govCount;
  const independentDocCount = currentWeek.independentCount;
  const windowSize = rollingWindow.length;
  const coldStart = windowSize < MIN_WINDOW_SIZE;

  // Compute rolling stats from prior weeks' government volume
  const { mean, stdDev } = computeStats(rollingWindow);

  // Independent activity: log-scaled presence
  // 0 docs → 0, 1 doc → 1, 10 docs → ~4.3, 100 docs → ~7.6
  const independentActivity = independentDocCount > 0 ? 1 + Math.log2(independentDocCount) : 0;

  // Sparse-source mode (#546): classify on the TRUE weekly mean (zero weeks
  // included) over the standard window — the z-path's mean omits zero weeks
  // and overstates volume for sparse categories.
  const recentSeries = sparseSeries.slice(-ROLLING_WINDOW_SIZE);
  const trueWeeklyMean =
    recentSeries.length > 0 ? recentSeries.reduce((s, v) => s + v, 0) / recentSeries.length : 0;

  if (trueWeeklyMean < SPARSE_VOLUME_FLOOR && sparseSeries.length > 0) {
    return buildSparseScore(sparseSeries, trueWeeklyMean, stdDev, currentWeek, independentActivity);
  }

  // Government silence z-score (positive = quieter than usual)
  // Capped at 0 when gov volume is at or above mean
  const rawZ = stdDev > 0 ? (mean - govDocCount) / stdDev : 0;
  const govSilenceZ = Math.max(0, rawZ);

  const silenceScore = govSilenceZ * independentActivity;
  const conspicuous = govSilenceZ > SILENCE_Z_THRESHOLD && independentDocCount > 0;

  return {
    govDocCount,
    independentDocCount,
    rollingGovMean: Math.round(mean * 100) / 100,
    rollingGovStdDev: Math.round(stdDev * 100) / 100,
    govSilenceZ: Math.round(govSilenceZ * 100) / 100,
    silenceScore: Math.round(silenceScore * 100) / 100,
    conspicuous,
    windowSize,
    coldStart,
    mode: 'zscore',
  };
}

// ---------------------------------------------------------------------------
// Database queries
// ---------------------------------------------------------------------------

interface WeekSourceCounts {
  govCount: number;
  independentCount: number;
}

/** Count documents by source classification for a single category-week. */
async function getWeekSourceCounts(
  category: string,
  weekOf: string,
): Promise<WeekSourceCounts | null> {
  const db = getDb();
  const weekEnd = addDays(weekOf, 7);

  const rows = await db.execute(sql`
    SELECT
      ${documents.sourceOrigin} AS source_origin,
      COUNT(*)::int AS doc_count
    FROM ${documents}
    WHERE ${documents.category} = ${category}
      AND ${documents.sourceOrigin} IS NOT NULL
      AND ${documents.publishedAt} >= ${weekOf}
      AND ${documents.publishedAt} < ${weekEnd}
      AND ${countingEligible()}
    GROUP BY ${documents.sourceOrigin}
  `);

  let govCount = 0;
  let independentCount = 0;
  for (const row of rows.rows as Array<Record<string, unknown>>) {
    const origin = row.source_origin as string;
    const count = row.doc_count as number;
    if (GOVERNMENT_SOURCES.has(origin)) govCount += count;
    else if (INDEPENDENT_SOURCES.has(origin)) independentCount += count;
  }

  return { govCount, independentCount };
}

/**
 * Get government-source document counts for the rolling window (prior N weeks).
 * Stays within the same administration period by clamping the window start
 * to the inauguration date of the current administration.
 */
async function getRollingGovCounts(category: string, weekOf: string): Promise<number[]> {
  const db = getDb();
  const govSourceList = [...GOVERNMENT_SOURCES];

  // Rolling window: up to ROLLING_WINDOW_SIZE weeks before weekOf,
  // clamped to stay within the same administration period.
  const rawWindowStart = addDays(weekOf, -7 * ROLLING_WINDOW_SIZE);
  const adminStart = getAdminInaugurationDate(weekOf);
  const windowStart = rawWindowStart > adminStart ? rawWindowStart : adminStart;

  const rows = await db.execute(sql`
    SELECT
      date_trunc('week', ${documents.publishedAt}::date)::date AS week_start,
      COUNT(*)::int AS gov_count
    FROM ${documents}
    WHERE ${documents.category} = ${category}
      AND ${documents.sourceOrigin} IN ${sql`(${sql.join(
        govSourceList.map((s) => sql`${s}`),
        sql`, `,
      )})`}
      AND ${documents.publishedAt} >= ${windowStart}
      AND ${documents.publishedAt} < ${weekOf}
      AND ${countingEligible()}
    GROUP BY week_start
    ORDER BY week_start
  `);

  return (rows.rows as Array<Record<string, unknown>>).map((r) => r.gov_count as number);
}

/**
 * Zero-filled chronological weekly gov-doc series for the sparse test (#546):
 * one entry per calendar week from the (admin-clamped) window start up to but
 * not including weekOf — weeks with no documents appear as 0, unlike
 * getRollingGovCounts, whose GROUP BY omits them.
 */
async function getRollingGovSeries(
  category: string,
  weekOf: string,
  windowWeeks: number,
): Promise<number[]> {
  const db = getDb();
  const govSourceList = [...GOVERNMENT_SOURCES];

  const rawWindowStart = addDays(weekOf, -7 * windowWeeks);
  const adminStart = getAdminInaugurationDate(weekOf);
  const windowStart = rawWindowStart > adminStart ? rawWindowStart : adminStart;

  const rows = await db.execute(sql`
    SELECT
      date_trunc('week', ${documents.publishedAt}::date)::date::text AS week_start,
      COUNT(*)::int AS gov_count
    FROM ${documents}
    WHERE ${documents.category} = ${category}
      AND ${documents.sourceOrigin} IN ${sql`(${sql.join(
        govSourceList.map((s) => sql`${s}`),
        sql`, `,
      )})`}
      AND ${documents.publishedAt} >= ${windowStart}
      AND ${documents.publishedAt} < ${weekOf}
      AND ${countingEligible()}
    GROUP BY week_start
  `);

  const byWeek = new Map<string, number>();
  for (const r of rows.rows as Array<Record<string, unknown>>) {
    byWeek.set(r.week_start as string, r.gov_count as number);
  }

  const series: number[] = [];
  // Walk ISO-Monday weeks to match date_trunc('week') buckets. windowStart is
  // Monday-aligned unless clamped to a non-Monday inauguration date
  // (2021-01-20 is a Wednesday) — snap back to that week's Monday so the
  // partial first week's docs land in the walk.
  for (let week = mondayOf(windowStart); week < weekOf; week = addDays(week, 7)) {
    series.push(byWeek.get(week) ?? 0);
  }
  return series;
}

/** ISO Monday of the week containing dateStr (UTC). */
export function mondayOf(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  const back = dow === 0 ? 6 : dow - 1;
  return addDays(dateStr, -back);
}

// ---------------------------------------------------------------------------
// Helpers (exported for unit testing)
// ---------------------------------------------------------------------------

/** Inauguration dates in descending order. */
const INAUGURATION_DATES = [
  '2025-01-20', // Trump T2
  '2021-01-20', // Biden
  '2017-01-20', // Trump T1
];

/**
 * Return the inauguration date of the administration that covers `weekOf`.
 * Falls back to the earliest known inauguration if weekOf predates all entries.
 */
export function getAdminInaugurationDate(weekOf: string): string {
  for (const date of INAUGURATION_DATES) {
    if (weekOf >= date) return date;
  }
  return INAUGURATION_DATES[INAUGURATION_DATES.length - 1];
}

/**
 * Sparse-source silence test (#546). Given a zero-filled chronological weekly
 * gov-doc series (oldest→newest, NOT including the current week) plus the
 * current week's gov count: silence is conspicuous when the source normally
 * speaks (presence rate ≥ SPARSE_MIN_PRESENCE) and the run of consecutive
 * zero weeks ending at the current week is improbable under that rate
 * ((1-p)^k < SPARSE_STREAK_P). The composite score mirrors the z-path's
 * shape: streak improbability × log-scaled independent activity.
 */
/** Assemble the sparse-mode SilenceScore (#546). */
function buildSparseScore(
  series: number[],
  trueWeeklyMean: number,
  stdDev: number,
  currentWeek: WeekSourceCounts,
  independentActivity: number,
): SilenceScore {
  const sparse = computeSparseSilence(series, currentWeek.govCount, independentActivity);
  return {
    govDocCount: currentWeek.govCount,
    independentDocCount: currentWeek.independentCount,
    rollingGovMean: Math.round(trueWeeklyMean * 100) / 100,
    rollingGovStdDev: Math.round(stdDev * 100) / 100,
    govSilenceZ: 0,
    silenceScore: sparse.silenceScore,
    conspicuous: sparse.conspicuous && currentWeek.independentCount > 0,
    windowSize: series.length,
    coldStart: series.length < MIN_WINDOW_SIZE,
    mode: 'sparse',
    presenceRate: sparse.presenceRate,
    zeroStreak: sparse.zeroStreak,
    coverageNote:
      'Government-source volume is too low for weekly z-scores in this category; ' +
      'silence is assessed as an improbably long absence against the historical presence rate.',
  };
}

export function computeSparseSilence(
  series: number[],
  currentGovCount: number,
  independentActivity: number,
): { presenceRate: number; zeroStreak: number; conspicuous: boolean; silenceScore: number } {
  const presentWeeks = series.filter((v) => v > 0).length;
  const presenceRate = series.length > 0 ? presentWeeks / series.length : 0;

  let zeroStreak = 0;
  if (currentGovCount === 0) {
    zeroStreak = 1;
    for (let i = series.length - 1; i >= 0 && series[i] === 0; i--) zeroStreak++;
  }

  const absenceProb = zeroStreak > 0 ? (1 - presenceRate) ** zeroStreak : 1;
  const conspicuous =
    presenceRate >= SPARSE_MIN_PRESENCE && zeroStreak > 0 && absenceProb < SPARSE_STREAK_P;

  // Improbability on a z-like scale: 0 when absence is expected, grows as the
  // streak becomes less probable (absenceProb 0.05 → ~1.3, 0.01 → ~2).
  const improbability = absenceProb < 1 ? -Math.log10(Math.max(absenceProb, 1e-6)) : 0;
  const silenceScore = conspicuous
    ? Math.round(improbability * independentActivity * 100) / 100
    : 0;

  return {
    presenceRate: Math.round(presenceRate * 100) / 100,
    zeroStreak,
    conspicuous,
    silenceScore,
  };
}

export function computeStats(values: number[]): { mean: number; stdDev: number } {
  if (values.length === 0) return { mean: 0, stdDev: 0 };
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (values.length < 2) return { mean, stdDev: 0 };
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
  return { mean, stdDev: Math.sqrt(variance) };
}

export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
