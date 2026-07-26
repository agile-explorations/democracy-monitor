import { CATEGORIES } from '@/lib/data/categories';
import { THEMATIC_MIN_DOC_COUNT } from '@/lib/methodology/scoring-config';
import { scanStandoutRuns } from '@/lib/services/structural-heatmap-service';
import type { StandoutRun } from '@/lib/services/structural-heatmap-service';
import type { ThematicHeatmapRow } from '@/lib/types/overview';
import type { ThematicDriftScore } from '@/lib/types/structural';

interface AggregateRow {
  category: string;
  week_of: string;
  thematic_detail: unknown;
  document_count?: number | null;
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
      // A 1-doc week's centroid IS the doc, so distance metrics read as
      // drift on tiny weeks (#579) — flag for display-level masking.
      const lowVolume = row != null && (row.document_count ?? 0) < THEMATIC_MIN_DOC_COUNT;
      return { week: w, ...parsed, lowVolume };
    });
    return { category: cat.key, title: cat.title, weeks };
  });
}

/**
 * Sustained thematic drift runs (#580). Only the z-score is scanned — it is
 * the one metric normalized against the category's own recent behavior.
 */
export function detectThematicStandouts(rows: ThematicHeatmapRow[]): StandoutRun[] {
  return scanStandoutRuns(
    rows.map((r) => ({
      category: r.category,
      title: r.title,
      weeks: r.weeks.map((w) => ({ week: w.week, values: { zScore: w.zScore } })),
    })),
    ['zScore'],
    { zScore: 'thematic drift' },
    (run) =>
      run.direction === 'above'
        ? `${run.title} shifted topics well beyond its recent norm for ${run.weekCount} straight weeks (${run.startWeek} to ${run.endWeek}).`
        : `${run.title} was unusually thematically static for ${run.weekCount} straight weeks (${run.startWeek} to ${run.endWeek}).`,
  );
}
