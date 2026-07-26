import { CATEGORIES } from '@/lib/data/categories';
import { overlapsInstrumentChange } from '@/lib/data/instrument-changes';
import type { StructuralDimension, StructuralHeatmapRow } from '@/lib/types/overview';
import type { StructuralScore } from '@/lib/types/structural';

interface AggregateRow {
  category: string;
  week_of: string;
  structural_detail: unknown;
}

const STRUCTURAL_DIMENSION_KEYS: StructuralDimension[] = [
  'volume',
  'typeComposition',
  'functionalDistribution',
  'agencyActivity',
  'publicationTempo',
  'sourceConvergence',
];

/** Parse structural_detail JSONB into typed dimension z-scores. */
export function parseStructuralDimensions(detail: unknown): {
  dimensions: Partial<Record<StructuralDimension, number | null>>;
  composite: number | null;
  anomalous: boolean;
} {
  if (!detail || typeof detail !== 'object') {
    return { dimensions: {}, composite: null, anomalous: false };
  }
  const d = detail as Partial<StructuralScore>;
  const dims: Partial<Record<StructuralDimension, number | null>> = {};
  if (d.dimensions) {
    for (const key of STRUCTURAL_DIMENSION_KEYS) {
      const dim = d.dimensions[key];
      dims[key] = dim?.available ? dim.zScore : null;
    }
  }
  return {
    dimensions: dims,
    composite: d.composite ?? null,
    anomalous: d.anomalous ?? false,
  };
}

/** Build structural heatmap rows from aggregate rows. */
export function buildStructuralHeatmapRows(rows: AggregateRow[]): StructuralHeatmapRow[] {
  const byCat = new Map<string, Map<string, AggregateRow>>();
  const allWeeksSet = new Set<string>();
  for (const row of rows) {
    if (!byCat.has(row.category)) byCat.set(row.category, new Map());
    byCat.get(row.category)!.set(row.week_of, row);
    allWeeksSet.add(row.week_of);
  }
  const allWeeks = Array.from(allWeeksSet).sort();

  return CATEGORIES.map((cat) => {
    const weekMap = byCat.get(cat.key);
    const weeks = allWeeks.map((w) => {
      const row = weekMap?.get(w);
      const parsed = parseStructuralDimensions(row?.structural_detail);
      return { week: w, ...parsed };
    });
    return { category: cat.key, title: cat.title, weeks };
  });
}

/** Human labels for standout sentences. */
const DIMENSION_LABELS: Record<StructuralDimension, string> = {
  volume: 'document volume',
  typeComposition: 'document-type mix',
  functionalDistribution: 'functional mix',
  agencyActivity: 'agency mix',
  publicationTempo: 'publication tempo',
  sourceConvergence: 'source convergence',
};

export interface StandoutRun {
  category: string;
  title: string;
  dimension: string;
  dimensionLabel: string;
  startWeek: string;
  endWeek: string;
  weekCount: number;
  meanZ: number;
  direction: 'above' | 'below';
  sentence: string;
}

const STANDOUT_MIN_ABS_Z = 2.5;
const STANDOUT_MIN_WEEKS = 3;
const STANDOUT_LIMIT = 8;

/**
 * Sustained structural anomalies (#575): runs of |z| >= 2.5 lasting at least
 * three consecutive weeks in one dimension. Ranked by duration x magnitude so
 * long, strong departures surface first. Null weeks (no data) break runs.
 */
/** A row any heatmap can offer the run scanner. */
export interface RunnableRow {
  category: string;
  title: string;
  weeks: Array<{ week: string; values: Record<string, number | null | undefined> }>;
}

/**
 * Generic sustained-run scanner (#575/#580): |z| >= 2.5 for >= 3 consecutive
 * same-sign weeks per (row, dimension); below-direction runs ending after an
 * instrument change for the category are suppressed as likely instrument
 * drift; ranked by duration x magnitude, top 8. `sentence` renders the
 * display copy so each surface keeps its own wording.
 */
function scanDimension(
  row: RunnableRow,
  dim: string,
  labels: Record<string, string>,
  sentence: (run: Omit<StandoutRun, 'sentence'>) => string,
  runs: StandoutRun[],
): void {
  let start = -1;
  let zs: number[] = [];
  const flush = (endIdx: number) => {
    if (start >= 0 && zs.length >= STANDOUT_MIN_WEEKS) {
      const meanZ = zs.reduce((a, b) => a + b, 0) / zs.length;
      const base: Omit<StandoutRun, 'sentence'> = {
        category: row.category,
        title: row.title,
        dimension: dim,
        dimensionLabel: labels[dim] ?? dim,
        startWeek: row.weeks[start].week,
        endWeek: row.weeks[endIdx].week,
        weekCount: zs.length,
        meanZ,
        direction: meanZ > 0 ? 'above' : 'below',
      };
      runs.push({ ...base, sentence: sentence(base) });
    }
    start = -1;
    zs = [];
  };
  row.weeks.forEach((w, i) => {
    const z = w.values[dim];
    const prev = zs.length > 0 ? zs[zs.length - 1] : null;
    const qualifies =
      z !== null &&
      z !== undefined &&
      Math.abs(z) >= STANDOUT_MIN_ABS_Z &&
      (prev === null || Math.sign(z) === Math.sign(prev));
    if (qualifies) {
      if (start < 0) start = i;
      zs.push(z as number);
    } else {
      flush(i - 1);
      if (z !== null && z !== undefined && Math.abs(z) >= STANDOUT_MIN_ABS_Z) {
        start = i;
        zs = [z as number];
      }
    }
  });
  flush(row.weeks.length - 1);
}

export function scanStandoutRuns(
  rows: RunnableRow[],
  dims: string[],
  labels: Record<string, string>,
  sentence: (run: Omit<StandoutRun, 'sentence'>) => string,
): StandoutRun[] {
  const runs: StandoutRun[] = [];
  for (const row of rows) {
    for (const dim of dims) {
      scanDimension(row, dim, labels, sentence, runs);
    }
  }
  return runs
    .filter(
      (r) =>
        r.direction === 'above' || !overlapsInstrumentChange(r.category, r.startWeek, r.endWeek),
    )
    .sort((a, b) => b.weekCount * Math.abs(b.meanZ) - a.weekCount * Math.abs(a.meanZ))
    .slice(0, STANDOUT_LIMIT);
}

export function detectStandoutRuns(rows: StructuralHeatmapRow[]): StandoutRun[] {
  return scanStandoutRuns(
    rows.map((r) => ({
      category: r.category,
      title: r.title,
      weeks: r.weeks.map((w) => ({ week: w.week, values: w.dimensions })),
    })),
    STRUCTURAL_DIMENSION_KEYS,
    DIMENSION_LABELS,
    (run) =>
      `${run.title} ran ${run.direction === 'above' ? 'well above' : 'well below'} its baseline ` +
      `${run.dimensionLabel} for ${run.weekCount} straight weeks (${run.startWeek} to ${run.endWeek}).`,
  );
}

/** Trailing-12-week mean |composite| per category, for row ordering (#576). */
export function orderRowsByRecentHeat(rows: StructuralHeatmapRow[]): StructuralHeatmapRow[] {
  const heat = (row: StructuralHeatmapRow): number => {
    const recent = row.weeks
      .slice(-12)
      .map((w) => w.composite)
      .filter((v): v is number => v !== null);
    if (recent.length === 0) return -1;
    return recent.reduce((a, b) => a + Math.abs(b), 0) / recent.length;
  };
  return [...rows].sort((a, b) => heat(b) - heat(a));
}
