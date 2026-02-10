import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SEED_VALIDATION_DATA } from '@/lib/data/validation/seed-data';
import { DIMENSION_TO_CATEGORY, SOURCE_METADATA } from '@/lib/data/validation-dimensions';
import * as dbModule from '@/lib/db';
import {
  ALIGNMENT_THRESHOLD,
  STATUS_SCORE,
  computeAlignment,
  buildComparisons,
  computeOverallAlignment,
  storeValidationDataPoints,
  getValidationSummary,
  getValidationTimeSeries,
} from '@/lib/services/validation-index-service';

vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn(),
  getDb: vi.fn(),
}));

describe('DIMENSION_TO_CATEGORY', () => {
  it('maps all dimensions used in seed data', () => {
    const seedDimensions = new Set(SEED_VALIDATION_DATA.map((d) => d.dimension));
    for (const dim of seedDimensions) {
      expect(DIMENSION_TO_CATEGORY).toHaveProperty(dim);
    }
  });

  it('maps to valid dashboard category keys', () => {
    const validCategories = [
      'civilService',
      'fiscal',
      'igs',
      'hatch',
      'courts',
      'military',
      'rulemaking',
      'indices',
      'infoAvailability',
      'elections',
      'mediaFreedom',
    ];
    for (const cat of Object.values(DIMENSION_TO_CATEGORY)) {
      expect(validCategories).toContain(cat);
    }
  });
});

describe('SOURCE_METADATA', () => {
  it('has metadata for all three sources', () => {
    expect(SOURCE_METADATA).toHaveProperty('v-dem');
    expect(SOURCE_METADATA).toHaveProperty('freedom-house');
    expect(SOURCE_METADATA).toHaveProperty('bright-line-watch');
  });

  it('each source has required fields', () => {
    for (const meta of Object.values(SOURCE_METADATA)) {
      expect(meta.name).toBeTruthy();
      expect(meta.url).toMatch(/^https?:\/\//);
      expect(meta.frequency).toBeTruthy();
      expect(meta.scaleDescription).toBeTruthy();
    }
  });
});

describe('computeAlignment', () => {
  it('aligns Stable with high external score', () => {
    expect(computeAlignment(0.85, 'Stable')).toBe('aligned');
  });

  it('aligns Warning with moderate external score', () => {
    expect(computeAlignment(0.65, 'Warning')).toBe('aligned');
  });

  it('diverges Capture from high external score', () => {
    expect(computeAlignment(0.85, 'Capture')).toBe('divergent');
  });

  it('diverges Drift from very high external score', () => {
    expect(computeAlignment(0.9, 'Drift')).toBe('divergent');
  });

  it('handles unknown status by using fallback score', () => {
    expect(computeAlignment(0.5, 'Unknown')).toBe('aligned');
  });
});

describe('ALIGNMENT_THRESHOLD', () => {
  it('is a positive number', () => {
    expect(ALIGNMENT_THRESHOLD).toBeGreaterThan(0);
    expect(ALIGNMENT_THRESHOLD).toBeLessThan(1);
  });
});

describe('STATUS_SCORE', () => {
  it('covers all standard status levels', () => {
    expect(STATUS_SCORE).toHaveProperty('Stable');
    expect(STATUS_SCORE).toHaveProperty('Warning');
    expect(STATUS_SCORE).toHaveProperty('Drift');
    expect(STATUS_SCORE).toHaveProperty('Capture');
  });

  it('scores are ordered Capture < Drift < Warning < Stable', () => {
    expect(STATUS_SCORE['Capture']).toBeLessThan(STATUS_SCORE['Drift']);
    expect(STATUS_SCORE['Drift']).toBeLessThan(STATUS_SCORE['Warning']);
    expect(STATUS_SCORE['Warning']).toBeLessThan(STATUS_SCORE['Stable']);
  });
});

describe('buildComparisons', () => {
  it('builds aligned comparison when external score matches internal status', () => {
    const latestBySourceDim = new Map([
      [
        'v-dem:rule_of_law',
        { source: 'v-dem', dimension: 'rule_of_law', score: 0.85, date: '2026-01-01' },
      ],
    ]);
    const latestByCategory = new Map([['courts', { status: 'Stable' }]]);

    const comparisons = buildComparisons(latestBySourceDim, latestByCategory);

    expect(comparisons).toHaveLength(1);
    expect(comparisons[0].alignment).toBe('aligned');
    expect(comparisons[0].internalCategory).toBe('courts');
    expect(comparisons[0].externalScore).toBe(0.85);
  });

  it('builds divergent comparison when scores disagree', () => {
    const latestBySourceDim = new Map([
      [
        'v-dem:rule_of_law',
        { source: 'v-dem', dimension: 'rule_of_law', score: 0.9, date: '2026-01-01' },
      ],
    ]);
    const latestByCategory = new Map([['courts', { status: 'Capture' }]]);

    const comparisons = buildComparisons(latestBySourceDim, latestByCategory);

    expect(comparisons).toHaveLength(1);
    expect(comparisons[0].alignment).toBe('divergent');
  });

  it('marks insufficient_data when no internal assessment exists', () => {
    const latestBySourceDim = new Map([
      [
        'v-dem:rule_of_law',
        { source: 'v-dem', dimension: 'rule_of_law', score: 0.7, date: '2026-01-01' },
      ],
    ]);
    const latestByCategory = new Map<string, { status: string }>();

    const comparisons = buildComparisons(latestBySourceDim, latestByCategory);

    expect(comparisons).toHaveLength(1);
    expect(comparisons[0].alignment).toBe('insufficient_data');
    expect(comparisons[0].internalStatus).toBe('unknown');
  });

  it('skips dimensions not in DIMENSION_TO_CATEGORY', () => {
    const latestBySourceDim = new Map([
      [
        'v-dem:nonexistent_dimension',
        { source: 'v-dem', dimension: 'nonexistent_dimension', score: 0.5, date: '2026-01-01' },
      ],
    ]);
    const latestByCategory = new Map([['courts', { status: 'Stable' }]]);

    const comparisons = buildComparisons(latestBySourceDim, latestByCategory);

    expect(comparisons).toHaveLength(0);
  });

  it('handles multiple source-dimension pairs', () => {
    const latestBySourceDim = new Map([
      [
        'v-dem:rule_of_law',
        { source: 'v-dem', dimension: 'rule_of_law', score: 0.85, date: '2026-01-01' },
      ],
      [
        'freedom-house:rule_of_law',
        { source: 'freedom-house', dimension: 'rule_of_law', score: 0.8, date: '2026-01-01' },
      ],
    ]);
    const latestByCategory = new Map([['courts', { status: 'Stable' }]]);

    const comparisons = buildComparisons(latestBySourceDim, latestByCategory);

    expect(comparisons).toHaveLength(2);
  });
});

describe('computeOverallAlignment', () => {
  it('returns 1 when all comparisons are aligned', () => {
    const comparisons = [
      {
        source: 'v-dem' as const,
        dimension: 'rule_of_law',
        externalScore: 0.85,
        internalCategory: 'courts',
        internalStatus: 'Stable',
        alignment: 'aligned' as const,
        lastUpdated: '2026-01-01',
      },
      {
        source: 'freedom-house' as const,
        dimension: 'rule_of_law',
        externalScore: 0.8,
        internalCategory: 'courts',
        internalStatus: 'Stable',
        alignment: 'aligned' as const,
        lastUpdated: '2026-01-01',
      },
    ];

    expect(computeOverallAlignment(comparisons)).toBe(1);
  });

  it('returns 0 when all comparisons are divergent', () => {
    const comparisons = [
      {
        source: 'v-dem' as const,
        dimension: 'rule_of_law',
        externalScore: 0.9,
        internalCategory: 'courts',
        internalStatus: 'Capture',
        alignment: 'divergent' as const,
        lastUpdated: '2026-01-01',
      },
    ];

    expect(computeOverallAlignment(comparisons)).toBe(0);
  });

  it('returns 0.5 when half aligned and half divergent', () => {
    const comparisons = [
      {
        source: 'v-dem' as const,
        dimension: 'rule_of_law',
        externalScore: 0.85,
        internalCategory: 'courts',
        internalStatus: 'Stable',
        alignment: 'aligned' as const,
        lastUpdated: '2026-01-01',
      },
      {
        source: 'v-dem' as const,
        dimension: 'media_freedom',
        externalScore: 0.9,
        internalCategory: 'mediaFreedom',
        internalStatus: 'Capture',
        alignment: 'divergent' as const,
        lastUpdated: '2026-01-01',
      },
    ];

    expect(computeOverallAlignment(comparisons)).toBe(0.5);
  });

  it('excludes insufficient_data from alignment calculation', () => {
    const comparisons = [
      {
        source: 'v-dem' as const,
        dimension: 'rule_of_law',
        externalScore: 0.85,
        internalCategory: 'courts',
        internalStatus: 'Stable',
        alignment: 'aligned' as const,
        lastUpdated: '2026-01-01',
      },
      {
        source: 'v-dem' as const,
        dimension: 'media_freedom',
        externalScore: 0.7,
        internalCategory: 'mediaFreedom',
        internalStatus: 'unknown',
        alignment: 'insufficient_data' as const,
        lastUpdated: '2026-01-01',
      },
    ];

    expect(computeOverallAlignment(comparisons)).toBe(1);
  });

  it('returns 0 for empty comparisons', () => {
    expect(computeOverallAlignment([])).toBe(0);
  });

  it('returns 0 when all comparisons are insufficient_data', () => {
    const comparisons = [
      {
        source: 'v-dem' as const,
        dimension: 'rule_of_law',
        externalScore: 0.7,
        internalCategory: 'courts',
        internalStatus: 'unknown',
        alignment: 'insufficient_data' as const,
        lastUpdated: '2026-01-01',
      },
    ];

    expect(computeOverallAlignment(comparisons)).toBe(0);
  });
});

describe('storeValidationDataPoints', () => {
  beforeEach(() => {
    vi.mocked(dbModule.isDbAvailable).mockReset();
  });

  it('resolves without error when DB is unavailable', async () => {
    vi.mocked(dbModule.isDbAvailable).mockReturnValue(false);
    await expect(
      storeValidationDataPoints([
        { source: 'v-dem', date: '2024-01-01', dimension: 'rule_of_law', score: 0.8 },
      ]),
    ).resolves.toBeUndefined();
  });

  it('resolves without error for empty array', async () => {
    vi.mocked(dbModule.isDbAvailable).mockReturnValue(true);
    await expect(storeValidationDataPoints([])).resolves.toBeUndefined();
  });
});

describe('getValidationSummary', () => {
  beforeEach(() => {
    vi.mocked(dbModule.isDbAvailable).mockReset();
  });

  it('returns empty summary when DB is unavailable', async () => {
    vi.mocked(dbModule.isDbAvailable).mockReturnValue(false);

    const summary = await getValidationSummary();

    expect(summary.sources).toEqual([]);
    expect(summary.comparisons).toEqual([]);
    expect(summary.overallAlignment).toBe(0);
  });
});

describe('getValidationTimeSeries', () => {
  beforeEach(() => {
    vi.mocked(dbModule.isDbAvailable).mockReset();
  });

  it('returns empty array when DB is unavailable', async () => {
    vi.mocked(dbModule.isDbAvailable).mockReturnValue(false);

    const series = await getValidationTimeSeries('v-dem', 'judicial_independence');

    expect(series).toEqual([]);
  });
});
