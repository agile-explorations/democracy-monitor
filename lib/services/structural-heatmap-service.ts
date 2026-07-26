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
  dimension: StructuralDimension;
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
function buildRun(
  row: StructuralHeatmapRow,
  dim: StructuralDimension,
  startWeek: string,
  endWeek: string,
  zs: number[],
): StandoutRun {
  const meanZ = zs.reduce((a, b) => a + b, 0) / zs.length;
  const direction = meanZ > 0 ? 'above' : 'below';
  return {
    category: row.category,
    title: row.title,
    dimension: dim,
    dimensionLabel: DIMENSION_LABELS[dim],
    startWeek,
    endWeek,
    weekCount: zs.length,
    meanZ,
    direction,
    sentence:
      `${row.title} ran ${direction === 'above' ? 'well above' : 'well below'} its baseline ` +
      `${DIMENSION_LABELS[dim]} for ${zs.length} straight weeks (${startWeek} to ${endWeek}).`,
  };
}

export function detectStandoutRuns(rows: StructuralHeatmapRow[]): StandoutRun[] {
  const runs: StandoutRun[] = [];
  for (const row of rows) {
    for (const dim of STRUCTURAL_DIMENSION_KEYS) {
      let start = -1;
      let zs: number[] = [];
      const flush = (endIdx: number) => {
        if (start >= 0 && zs.length >= STANDOUT_MIN_WEEKS) {
          runs.push(buildRun(row, dim, row.weeks[start].week, row.weeks[endIdx].week, zs));
        }
        start = -1;
        zs = [];
      };
      row.weeks.forEach((w, i) => {
        const z = w.dimensions[dim];
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
  }
  return runs
    .filter(
      // A below-baseline run overlapping an ingest-methodology change for its
      // category is likely instrument drift, not world drift (#577) — never
      // present it as a finding.
      (r) =>
        r.direction === 'above' || !overlapsInstrumentChange(r.category, r.startWeek, r.endWeek),
    )
    .sort((a, b) => b.weekCount * Math.abs(b.meanZ) - a.weekCount * Math.abs(a.meanZ))
    .slice(0, STANDOUT_LIMIT);
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
