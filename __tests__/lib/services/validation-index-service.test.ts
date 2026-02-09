import { describe, expect, it, vi, beforeEach } from 'vitest';
import { SEED_VALIDATION_DATA } from '@/lib/data/validation/seed-data';
import { DIMENSION_TO_CATEGORY, SOURCE_METADATA } from '@/lib/data/validation-dimensions';
import * as dbModule from '@/lib/db';
import {
  ALIGNMENT_THRESHOLD,
  STATUS_SCORE,
  computeAlignment,
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

describe('storeValidationDataPoints', () => {
  beforeEach(() => {
    vi.mocked(dbModule.isDbAvailable).mockReset();
  });

  it('resolves without error when DB is unavailable', async () => {
    vi.mocked(dbModule.isDbAvailable).mockReturnValue(false);
    await expect(
      storeValidationDataPoints([
        { source: 'v-dem', date: '2024-01-01', dimension: 'judicial_independence', score: 0.8 },
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
