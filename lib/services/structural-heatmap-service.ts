import { CATEGORIES } from '@/lib/data/categories';
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
