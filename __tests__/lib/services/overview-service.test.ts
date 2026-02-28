import { describe, it, expect } from 'vitest';
import { buildOverviewFromRows } from '@/lib/services/overview-service';

function makeRow(
  category: string,
  week_of: string,
  convergence_score: number | null = null,
  convergence_detail: unknown = null,
  structural_detail: unknown = null,
) {
  return { category, week_of, convergence_score, convergence_detail, structural_detail };
}

describe('buildOverviewFromRows', () => {
  it('returns empty arrays for empty input', () => {
    const result = buildOverviewFromRows([]);
    expect(result.heatmap).toHaveLength(14); // Still includes all CATEGORIES
    expect(result.synchrony).toEqual([]);
    expect(result.statusCounts).toEqual({
      Stable: 14,
      Elevated: 0,
      Divergent: 0,
      ConfirmedConcern: 0,
    });
  });

  it('builds heatmap rows with convergence scores', () => {
    const rows = [
      makeRow('civilService', '2026-01-06', 0.5),
      makeRow('civilService', '2026-01-13', 0.8),
      makeRow('fiscal', '2026-01-06', 0.1),
      makeRow('fiscal', '2026-01-13', null),
    ];
    const result = buildOverviewFromRows(rows);

    const csHeatmap = result.heatmap.find((r) => r.category === 'civilService');
    expect(csHeatmap).toBeDefined();
    expect(csHeatmap!.weeks).toHaveLength(2);
    expect(csHeatmap!.weeks[0]).toEqual({ week: '2026-01-06', score: 0.5 });
    expect(csHeatmap!.weeks[1]).toEqual({ week: '2026-01-13', score: 0.8 });

    // null convergence_score defaults to 0
    const fiscalHeatmap = result.heatmap.find((r) => r.category === 'fiscal');
    expect(fiscalHeatmap!.weeks[1].score).toBe(0);
  });

  it('parses status from convergenceDetail JSONB', () => {
    const rows = [
      makeRow('civilService', '2026-01-06', 0.5, { status: 'Elevated' }),
      makeRow('fiscal', '2026-01-06', 0.1, { status: 'Stable' }),
      makeRow('military', '2026-01-06', 0.9, { status: 'ConfirmedConcern' }),
    ];
    const result = buildOverviewFromRows(rows);

    const csTimeline = result.statusTimeline.find((r) => r.category === 'civilService');
    expect(csTimeline!.segments[0].status).toBe('Elevated');

    const milTimeline = result.statusTimeline.find((r) => r.category === 'military');
    expect(milTimeline!.segments[0].status).toBe('ConfirmedConcern');
  });

  it('defaults to Stable when convergenceDetail is null or invalid', () => {
    const rows = [
      makeRow('civilService', '2026-01-06', 0.5, null),
      makeRow('fiscal', '2026-01-06', 0.1, { foo: 'bar' }),
    ];
    const result = buildOverviewFromRows(rows);

    const csTimeline = result.statusTimeline.find((r) => r.category === 'civilService');
    expect(csTimeline!.segments[0].status).toBe('Stable');
  });

  it('counts synchrony (elevated+ categories per week)', () => {
    const rows = [
      makeRow('civilService', '2026-01-06', 0.5, { status: 'Elevated' }),
      makeRow('fiscal', '2026-01-06', 0.1, { status: 'Stable' }),
      makeRow('military', '2026-01-06', 0.9, { status: 'Divergent' }),
    ];
    const result = buildOverviewFromRows(rows);

    expect(result.synchrony).toHaveLength(1);
    expect(result.synchrony[0].elevatedCount).toBe(2); // Elevated + Divergent
  });

  it('counts status distribution for latest week only', () => {
    const rows = [
      makeRow('civilService', '2026-01-06', 0.5, { status: 'Elevated' }),
      makeRow('civilService', '2026-01-13', 0.3, { status: 'Stable' }),
      makeRow('fiscal', '2026-01-06', 0.1, { status: 'Stable' }),
      makeRow('fiscal', '2026-01-13', 0.8, { status: 'Divergent' }),
    ];
    const result = buildOverviewFromRows(rows);

    // Latest week is 2026-01-13
    // civilService=Stable, fiscal=Divergent, rest=Stable (12 more)
    expect(result.statusCounts.Stable).toBe(13);
    expect(result.statusCounts.Divergent).toBe(1);
    expect(result.statusCounts.Elevated).toBe(0);
  });

  it('sorts heatmap/timeline by long-horizon drift descending', () => {
    const rows = [
      makeRow('civilService', '2026-01-06', 0.2, null, {
        longHorizon: { cumulativeDeviation: 5.0 },
      }),
      makeRow('fiscal', '2026-01-06', 0.8, null, {
        longHorizon: { cumulativeDeviation: 10.0 },
      }),
    ];
    const result = buildOverviewFromRows(rows);

    // fiscal has higher drift → should be sorted first among the categories that have data
    const fiscalIdx = result.heatmap.findIndex((r) => r.category === 'fiscal');
    const csIdx = result.heatmap.findIndex((r) => r.category === 'civilService');
    expect(fiscalIdx).toBeLessThan(csIdx);
  });

  it('includes all 14 categories even when DB has no rows for some', () => {
    const rows = [makeRow('civilService', '2026-01-06', 0.5)];
    const result = buildOverviewFromRows(rows);

    expect(result.heatmap).toHaveLength(14);
    expect(result.statusTimeline).toHaveLength(14);

    // Categories without data still get entries
    const fiscal = result.heatmap.find((r) => r.category === 'fiscal');
    expect(fiscal).toBeDefined();
    expect(fiscal!.weeks).toHaveLength(1);
    expect(fiscal!.weeks[0].score).toBe(0);
  });
});
