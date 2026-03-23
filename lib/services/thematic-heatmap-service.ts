import { CATEGORIES } from '@/lib/data/categories';
import type { ThematicHeatmapRow } from '@/lib/types/overview';
import type { ThematicDriftScore } from '@/lib/types/structural';

interface AggregateRow {
  category: string;
  week_of: string;
  thematic_detail: unknown;
}

/** Parse thematic_detail JSONB into typed metric values. */
export function parseThematicDimensions(detail: unknown): {
  zScore: number | null;
  centroidDistance: number | null;
  novelDocRate: number | null;
  varianceRatio: number | null;
  crossAdminDistance: number | null;
  bootstrap: boolean;
} {
  if (!detail || typeof detail !== 'object') {
    return {
      zScore: null,
      centroidDistance: null,
      novelDocRate: null,
      varianceRatio: null,
      crossAdminDistance: null,
      bootstrap: false,
    };
  }
  const d = detail as Partial<ThematicDriftScore>;
  return {
    zScore: d.zScore ?? null,
    centroidDistance: d.rollingCentroidDistance ?? null,
    novelDocRate: d.novelDocumentRate ?? null,
    varianceRatio: d.varianceRatio ?? null,
    crossAdminDistance: d.crossAdminDistance ?? null,
    bootstrap: d.bootstrap ?? false,
  };
}

/** Build thematic heatmap rows from aggregate rows. */
export function buildThematicHeatmapRows(rows: AggregateRow[]): ThematicHeatmapRow[] {
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
      const parsed = parseThematicDimensions(row?.thematic_detail);
      return { week: w, ...parsed };
    });
    return { category: cat.key, title: cat.title, weeks };
  });
}
