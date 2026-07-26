import { CATEGORIES } from '@/lib/data/categories';
import { overlapsInstrumentChange } from '@/lib/data/instrument-changes';
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

/** Single-week drift z at or above this is a standout spike (#582). */
const THEMATIC_SPIKE_Z = 4;
const THEMATIC_STANDOUT_LIMIT = 8;

/**
 * Thematic standouts (#580/#582). Rolling-window z-scores MEAN-REVERT: after
 * a real topic shift the window absorbs the new mix within a week or two, so
 * upward drift almost never sustains a 3-week run — the interesting shifts
 * are SPIKES. Detect single-week spikes (z >= 4, instrument-suppressed) and
 * rank them above sustained runs; static (below) runs rank last — they are
 * context, not headlines.
 */
export function detectThematicStandouts(rows: ThematicHeatmapRow[]): StandoutRun[] {
  const runs = scanStandoutRuns(
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
    'both',
  );

  const inRun = new Set(
    runs.flatMap((r) => [`${r.category}|${r.startWeek}`, `${r.category}|${r.endWeek}`]),
  );
  const spikes: StandoutRun[] = [];
  for (const row of rows) {
    for (const w of row.weeks) {
      if (w.zScore === null || w.zScore < THEMATIC_SPIKE_Z) continue;
      if (inRun.has(`${row.category}|${w.week}`)) continue;
      if (overlapsInstrumentChange(row.category, w.week, w.week)) continue;
      spikes.push({
        category: row.category,
        title: row.title,
        dimension: 'zScore',
        dimensionLabel: 'thematic drift',
        startWeek: w.week,
        endWeek: w.week,
        weekCount: 1,
        meanZ: w.zScore,
        direction: 'above',
        sentence: `${row.title}'s topics shifted sharply in the week of ${w.week}.`,
      });
    }
  }

  const score = (r: StandoutRun) => r.weekCount * Math.abs(r.meanZ);
  const shifts = [...spikes, ...runs.filter((r) => r.direction === 'above')].sort(
    (a, b) => score(b) - score(a),
  );
  const statics = runs.filter((r) => r.direction === 'below').sort((a, b) => score(b) - score(a));
  return [...shifts, ...statics].slice(0, THEMATIC_STANDOUT_LIMIT);
}
