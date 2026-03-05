import { describe, it, expect } from 'vitest';
import {
  buildOverviewFromRows,
  computeWeeklyWeightedScores,
} from '@/lib/services/overview-service';

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
      makeRow('civilService', '2026-01-06', 0.5, { status: 'Stable' }),
      makeRow('civilService', '2026-01-13', 0.8, { status: 'Stable' }),
      makeRow('fiscal', '2026-01-06', 0.1, { status: 'Stable' }),
      makeRow('fiscal', '2026-01-13', null, { status: 'Stable' }),
    ];
    const result = buildOverviewFromRows(rows);

    const csHeatmap = result.heatmap.find((r) => r.category === 'civilService');
    expect(csHeatmap).toBeDefined();
    expect(csHeatmap!.weeks).toHaveLength(2);
    expect(csHeatmap!.weeks[0]).toEqual({ week: '2026-01-06', score: 0.5 });
    expect(csHeatmap!.weeks[1]).toEqual({ week: '2026-01-13', score: 0.8 });

    // null convergence_score stays null (not converted to 0)
    const fiscalHeatmap = result.heatmap.find((r) => r.category === 'fiscal');
    expect(fiscalHeatmap!.weeks[1].score).toBeNull();
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

  it('returns null status for categories without convergenceDetail in a week', () => {
    // military has convergence_detail so the week is included;
    // civilService and fiscal lack it, so their segments show null status
    const rows = [
      makeRow('civilService', '2026-01-06', 0.5, null),
      makeRow('fiscal', '2026-01-06', 0.1, { foo: 'bar' }),
      makeRow('military', '2026-01-06', 0.3, { status: 'Stable' }),
    ];
    const result = buildOverviewFromRows(rows);

    const csTimeline = result.statusTimeline.find((r) => r.category === 'civilService');
    expect(csTimeline!.segments[0].status).toBeNull();

    const fiscalTimeline = result.statusTimeline.find((r) => r.category === 'fiscal');
    expect(fiscalTimeline!.segments[0].status).toBeNull();
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

  it('computes weighted score from per-status counts', () => {
    const rows = [
      makeRow('civilService', '2026-01-06', 0.5, { status: 'Elevated' }),
      makeRow('fiscal', '2026-01-06', 0.1, { status: 'Divergent' }),
      makeRow('military', '2026-01-06', 0.9, { status: 'ConfirmedConcern' }),
    ];
    const result = buildOverviewFromRows(rows);
    const pt = result.synchrony[0];

    // Elevated=1×1, Divergent=1×2, ConfirmedConcern=1×3 = 6
    expect(pt.elevatedWeighted).toBe(1);
    expect(pt.divergentWeighted).toBe(2);
    expect(pt.confirmedWeighted).toBe(3);
    expect(pt.weightedScore).toBe(6);
  });

  it('returns zero weighted fields when all statuses are Stable', () => {
    const rows = [
      makeRow('civilService', '2026-01-06', 0.2, { status: 'Stable' }),
      makeRow('fiscal', '2026-01-06', 0.1, { status: 'Stable' }),
    ];
    const result = buildOverviewFromRows(rows);
    const pt = result.synchrony[0];

    expect(pt.weightedScore).toBe(0);
    expect(pt.elevatedWeighted).toBe(0);
    expect(pt.divergentWeighted).toBe(0);
    expect(pt.confirmedWeighted).toBe(0);
  });

  it('does not count null status as elevated', () => {
    // fiscal has convergence so the week is included; civilService has null detail
    const rows = [
      makeRow('civilService', '2026-01-06', 0.5, null),
      makeRow('fiscal', '2026-01-06', 0.1, { status: 'Elevated' }),
    ];
    const result = buildOverviewFromRows(rows);

    expect(result.synchrony[0].elevatedCount).toBe(1);
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
    // civilService=Stable, fiscal=Divergent, rest=Stable (12 more, null->Stable fallback)
    expect(result.statusCounts.Stable).toBe(13);
    expect(result.statusCounts.Divergent).toBe(1);
    expect(result.statusCounts.Elevated).toBe(0);
  });

  it('preserves canonical CATEGORIES order in heatmap/timeline', () => {
    const rows = [
      makeRow('fiscal', '2026-01-06', 0.8, { status: 'Stable' }),
      makeRow('civilService', '2026-01-06', 0.2, { status: 'Stable' }),
    ];
    const result = buildOverviewFromRows(rows);

    // civilService comes before fiscal in canonical CATEGORIES array
    const csIdx = result.heatmap.findIndex((r) => r.category === 'civilService');
    const fiscalIdx = result.heatmap.findIndex((r) => r.category === 'fiscal');
    expect(csIdx).toBeLessThan(fiscalIdx);
  });

  it('includes all 14 categories even when DB has no rows for some', () => {
    const rows = [makeRow('civilService', '2026-01-06', 0.5, { status: 'Stable' })];
    const result = buildOverviewFromRows(rows);

    expect(result.heatmap).toHaveLength(14);
    expect(result.statusTimeline).toHaveLength(14);

    // Categories without data still get entries with null score
    const fiscal = result.heatmap.find((r) => r.category === 'fiscal');
    expect(fiscal).toBeDefined();
    expect(fiscal!.weeks).toHaveLength(1);
    expect(fiscal!.weeks[0].score).toBeNull();
  });
});

describe('computeWeeklyWeightedScores', () => {
  it('returns empty map for empty input', () => {
    const result = computeWeeklyWeightedScores([], '2017-01-20');
    expect(result.size).toBe(0);
  });

  it('groups by week and computes weighted scores', () => {
    const rows = [
      makeRow('civilService', '2017-01-23', 0.5, { status: 'Elevated' }),
      makeRow('fiscal', '2017-01-23', 0.1, { status: 'Divergent' }),
      makeRow('civilService', '2017-01-30', 0.3, { status: 'Stable' }),
      makeRow('fiscal', '2017-01-30', 0.8, { status: 'ConfirmedConcern' }),
    ];
    const result = computeWeeklyWeightedScores(rows, '2017-01-20');

    // Week 2017-01-23: offset ≈ 0 (3 days / 7 rounds to 0)
    // Elevated(1) + Divergent(2) = 3
    expect(result.get(0)).toBe(3);

    // Week 2017-01-30: offset ≈ 1 (10 days / 7 rounds to 1)
    // Stable(0) + ConfirmedConcern(3) = 3
    expect(result.get(1)).toBe(3);
  });

  it('indexes by week offset from period start', () => {
    const rows = [
      makeRow('civilService', '2021-02-01', 0.5, { status: 'Elevated' }),
      makeRow('civilService', '2021-03-01', 0.5, { status: 'Elevated' }),
    ];
    const result = computeWeeklyWeightedScores(rows, '2021-01-20');

    // 2021-02-01 is 12 days after 2021-01-20 → round(12/7) = round(1.71) = 2
    expect(result.has(2)).toBe(true);
    // 2021-03-01 is 39 days after 2021-01-20 → round(39/7) = round(5.57) = 6
    expect(result.has(6)).toBe(true);
  });

  it('treats null convergence_detail as Stable (weight 0)', () => {
    const rows = [
      makeRow('civilService', '2017-01-23', 0.5, null),
      makeRow('fiscal', '2017-01-23', 0.1, null),
    ];
    const result = computeWeeklyWeightedScores(rows, '2017-01-20');
    // null status → Stable → weight 0
    expect(result.get(0)).toBe(0);
  });

  it('sums weights across all categories in a week', () => {
    const rows = [
      makeRow('civilService', '2017-01-23', 0.5, { status: 'ConfirmedConcern' }),
      makeRow('fiscal', '2017-01-23', 0.1, { status: 'ConfirmedConcern' }),
      makeRow('military', '2017-01-23', 0.3, { status: 'Elevated' }),
    ];
    const result = computeWeeklyWeightedScores(rows, '2017-01-20');
    // 3 + 3 + 1 = 7
    expect(result.get(0)).toBe(7);
  });
});
