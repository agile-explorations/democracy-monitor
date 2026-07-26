import { describe, it, expect } from 'vitest';
import {
  buildThematicHeatmapRows,
  detectThematicStandouts,
  parseThematicDimensions,
} from '@/lib/services/thematic-heatmap-service';

describe('parseThematicDimensions', () => {
  it('returns nulls for null/undefined detail', () => {
    expect(parseThematicDimensions(null)).toEqual({
      zScore: null,
      centroidDistance: null,
      novelDocRate: null,
      varianceRatio: null,
      crossAdminDistance: null,
      bootstrap: false,
    });
    expect(parseThematicDimensions(undefined)).toEqual({
      zScore: null,
      centroidDistance: null,
      novelDocRate: null,
      varianceRatio: null,
      crossAdminDistance: null,
      bootstrap: false,
    });
  });

  it('returns nulls for non-object detail', () => {
    expect(parseThematicDimensions('string')).toEqual({
      zScore: null,
      centroidDistance: null,
      novelDocRate: null,
      varianceRatio: null,
      crossAdminDistance: null,
      bootstrap: false,
    });
  });

  it('parses valid thematic detail', () => {
    const detail = {
      zScore: 1.5,
      rollingCentroidDistance: 0.12,
      novelDocumentRate: 0.25,
      varianceRatio: 1.1,
      crossAdminDistance: 0.3,
      bootstrap: true,
      rollingWindow: { weeks: 8, meanDistance: 0.1, stdDev: 0.03 },
    };
    expect(parseThematicDimensions(detail)).toEqual({
      zScore: 1.5,
      centroidDistance: 0.12,
      novelDocRate: 0.25,
      varianceRatio: 1.1,
      crossAdminDistance: 0.3,
      bootstrap: true,
    });
  });

  it('handles partial detail with missing fields', () => {
    const detail = { zScore: 2.0 };
    expect(parseThematicDimensions(detail)).toEqual({
      zScore: 2.0,
      centroidDistance: null,
      novelDocRate: null,
      varianceRatio: null,
      crossAdminDistance: null,
      bootstrap: false,
    });
  });
});

describe('buildThematicHeatmapRows', () => {
  it('returns rows for all categories with aligned weeks', () => {
    const rows = [
      {
        category: 'civilService',
        week_of: '2025-02-03',
        thematic_detail: {
          zScore: 1.2,
          rollingCentroidDistance: 0.1,
          novelDocumentRate: 0.15,
          varianceRatio: 0.9,
          crossAdminDistance: null,
          bootstrap: false,
        },
      },
      {
        category: 'civilService',
        week_of: '2025-02-10',
        thematic_detail: {
          zScore: -0.5,
          rollingCentroidDistance: 0.05,
          novelDocumentRate: 0.1,
          varianceRatio: 1.0,
          crossAdminDistance: 0.2,
          bootstrap: true,
        },
      },
    ];

    const result = buildThematicHeatmapRows(rows);

    // Should have 14 categories (one per CATEGORIES entry)
    expect(result.length).toBe(14);

    // civilService should have data
    const cs = result.find((r) => r.category === 'civilService');
    expect(cs).toBeDefined();
    expect(cs!.weeks).toHaveLength(2);
    expect(cs!.weeks[0].zScore).toBe(1.2);
    expect(cs!.weeks[0].centroidDistance).toBe(0.1);
    expect(cs!.weeks[1].zScore).toBe(-0.5);
    expect(cs!.weeks[1].bootstrap).toBe(true);

    // Other categories should have null values
    const fiscal = result.find((r) => r.category === 'fiscal');
    expect(fiscal).toBeDefined();
    expect(fiscal!.weeks[0].zScore).toBeNull();
  });

  it('returns empty weeks array when no rows provided', () => {
    const result = buildThematicHeatmapRows([]);
    expect(result.length).toBe(14);
    expect(result[0].weeks).toHaveLength(0);
  });
});

describe('detectThematicStandouts + lowVolume (#579/#580)', () => {
  const wk = (week: string, zScore: number | null) => ({
    week,
    zScore,
    centroidDistance: null,
    novelDocRate: null,
    varianceRatio: null,
    crossAdminDistance: null,
    bootstrap: false,
    lowVolume: false,
  });

  it('surfaces sustained drift with thematic wording', () => {
    const rows = [
      {
        category: 'military',
        title: 'Using Military Inside the U.S.',
        weeks: [wk('2026-01-05', 3), wk('2026-01-12', 3), wk('2026-01-19', 3)],
      },
    ];
    const runs = detectThematicStandouts(rows as any);
    expect(runs).toHaveLength(1);
    expect(runs[0].sentence).toContain('shifted topics well beyond its recent norm');
  });

  it('suppresses static (below) runs after an instrument change for the category', () => {
    const rows = [
      {
        category: 'civilLiberties',
        title: 'Civil Rights & Liberties',
        weeks: [wk('2026-03-02', -3), wk('2026-03-09', -3), wk('2026-03-16', -3)],
      },
    ];
    expect(detectThematicStandouts(rows as any)).toHaveLength(0);
  });

  it('flags lowVolume from document_count below the floor', () => {
    const rows = buildThematicHeatmapRows([
      {
        category: 'hatch',
        week_of: '2026-01-05',
        thematic_detail: { zScore: 1 },
        document_count: 2,
      },
    ]);
    const hatch = rows.find((r) => r.category === 'hatch')!;
    expect(hatch.weeks[0].lowVolume).toBe(true);
  });
});
