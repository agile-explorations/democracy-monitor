import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runVerify } from '@/lib/cron/backfill-verify';

vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn().mockReturnValue(true),
}));

const mockGetDocumentCoverage = vi.fn().mockResolvedValue([]);
const mockGetStageCompleteness = vi.fn().mockResolvedValue({
  totalDocuments: 100,
  missingScores: 0,
  missingEmbeddings: 0,
  totalWeeks: 10,
  missingAggregates: 0,
});
const mockGetBaselineCompleteness = vi.fn().mockResolvedValue([]);
const mockGetLayer2Completeness = vi.fn().mockResolvedValue([]);
const mockGetPaginationFitness = vi.fn().mockResolvedValue([]);
const mockGetFrPeriodCoverage = vi.fn().mockResolvedValue([]);
const mockGetGdeltCrossfeedCoverage = vi.fn().mockResolvedValue([]);

vi.mock('@/lib/services/backfill-verification-service', () => ({
  getDocumentCoverage: (...args: unknown[]) => mockGetDocumentCoverage(...args),
  getStageCompleteness: (...args: unknown[]) => mockGetStageCompleteness(...args),
  getBaselineCompleteness: (...args: unknown[]) => mockGetBaselineCompleteness(...args),
  getLayer2Completeness: (...args: unknown[]) => mockGetLayer2Completeness(...args),
  getPaginationFitness: (...args: unknown[]) => mockGetPaginationFitness(...args),
  getFrPeriodCoverage: (...args: unknown[]) => mockGetFrPeriodCoverage(...args),
  getGdeltCrossfeedCoverage: (...args: unknown[]) => mockGetGdeltCrossfeedCoverage(...args),
}));

describe('backfill-verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('throws when DB is unavailable', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(false);

    await expect(runVerify({})).rejects.toThrow('DATABASE_URL not configured');
  });

  it('returns no warnings when all checks pass', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    // Provide FR coverage for all categories and all periods
    const { CATEGORIES } = await import('@/lib/data/categories');
    const periods = ['biden_2022', 'biden_2021', 'trump_2017', 'trump_2018', 'trump_t2'];
    const frCoverage = CATEGORIES.flatMap((cat) =>
      periods.map((p) => ({
        category: cat.key,
        sourceOrigin: 'federal_register',
        period: p,
        count: 10,
      })),
    );
    mockGetFrPeriodCoverage.mockResolvedValue(frCoverage);

    // GDELT coverage for all categories
    const gdeltCoverage = CATEGORIES.map((cat) => ({
      category: cat.key,
      sourceOrigin: 'gdelt',
      period: 'all',
      count: 5,
    }));
    mockGetGdeltCrossfeedCoverage.mockResolvedValue(gdeltCoverage);

    // Baselines for all categories × all configs
    const { BASELINE_CONFIGS } = await import('@/lib/data/baselines');
    const baselineCoverage = BASELINE_CONFIGS.flatMap((config) =>
      CATEGORIES.map((cat) => ({ baselineId: config.id, category: cat.key, hasStats: true })),
    );
    mockGetBaselineCompleteness.mockResolvedValue(baselineCoverage);

    const report = await runVerify({});
    expect(report.warnings).toEqual([]);
  });

  it('warns when documents are missing scores', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    mockGetStageCompleteness.mockResolvedValue({
      totalDocuments: 100,
      missingScores: 15,
      missingEmbeddings: 0,
      totalWeeks: 10,
      missingAggregates: 0,
    });

    const report = await runVerify({});
    expect(report.warnings).toContainEqual(expect.stringContaining('15 documents need scores'));
  });

  it('warns when documents are missing embeddings', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    mockGetStageCompleteness.mockResolvedValue({
      totalDocuments: 100,
      missingScores: 0,
      missingEmbeddings: 30,
      totalWeeks: 10,
      missingAggregates: 0,
    });

    const report = await runVerify({});
    expect(report.warnings).toContainEqual(expect.stringContaining('30 documents need embedding'));
  });

  it('warns when weeks are missing aggregates', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    mockGetStageCompleteness.mockResolvedValue({
      totalDocuments: 100,
      missingScores: 0,
      missingEmbeddings: 0,
      totalWeeks: 10,
      missingAggregates: 3,
    });

    const report = await runVerify({});
    expect(report.warnings).toContainEqual(expect.stringContaining('3 weeks need aggregates'));
  });

  it('warns when CL pagination cap is hit', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    mockGetPaginationFitness.mockResolvedValue([
      { category: 'civilLiberties', sourceOrigin: 'courtlistener', peakWeeklyCount: 350 },
    ]);

    const report = await runVerify({});
    expect(report.warnings).toContainEqual(
      expect.stringContaining('civilLiberties CourtListener peak=350 hits pagination cap 300'),
    );
  });

  it('does not warn when CL peak is below cap', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    mockGetPaginationFitness.mockResolvedValue([
      { category: 'civilLiberties', sourceOrigin: 'courtlistener', peakWeeklyCount: 250 },
    ]);

    const report = await runVerify({});
    const clWarnings = report.warnings.filter((w) => w.includes('pagination cap'));
    expect(clWarnings).toHaveLength(0);
  });

  it('warns when a category is missing FR docs in some periods', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    // Only provide 2 of 5 expected periods for executiveActions
    mockGetFrPeriodCoverage.mockResolvedValue([
      {
        category: 'executiveActions',
        sourceOrigin: 'federal_register',
        period: 'biden_2022',
        count: 10,
      },
      {
        category: 'executiveActions',
        sourceOrigin: 'federal_register',
        period: 'trump_t2',
        count: 5,
      },
    ]);

    const report = await runVerify({ category: 'executiveActions' });
    expect(report.warnings).toContainEqual(
      expect.stringContaining('executiveActions missing FR documents in:'),
    );
  });

  it('warns when a category has no FR documents at all', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    mockGetFrPeriodCoverage.mockResolvedValue([]);

    const report = await runVerify({ category: 'executiveActions' });
    expect(report.warnings).toContainEqual(
      expect.stringContaining('executiveActions has no FR documents in any period'),
    );
  });

  it('warns when non-thin categories are missing GDELT cross-feed', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    mockGetGdeltCrossfeedCoverage.mockResolvedValue([]);
    // executiveActions has enough docs to not be considered thin
    mockGetDocumentCoverage.mockResolvedValue([
      { category: 'executiveActions', sourceOrigin: 'federal_register', count: 8000 },
    ]);

    const report = await runVerify({ category: 'executiveActions' });
    expect(report.warnings).toContainEqual(
      expect.stringContaining('Categories missing GDELT cross-feed'),
    );
  });

  it('does not warn for thin categories missing GDELT cross-feed', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    mockGetGdeltCrossfeedCoverage.mockResolvedValue([]);
    mockGetDocumentCoverage.mockResolvedValue([
      { category: 'hatch', sourceOrigin: 'federal_register', count: 22 },
    ]);

    const report = await runVerify({ category: 'hatch' });
    const gdeltWarnings = report.warnings.filter((w) => w.includes('GDELT'));
    expect(gdeltWarnings).toHaveLength(0);
  });

  it('warns when L2 docs are missing Pass 1', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    mockGetLayer2Completeness.mockResolvedValue([
      {
        period: 'trump_t2',
        label: 'Trump T2 (2025–)',
        totalDocuments: 50,
        pass1Assessed: 38,
        missingPass1: 12,
        pass1Flagged: 5,
        pass2Flagged: 5,
        missingPass2: 0,
        auditSampled: 10,
        auditFalseNegatives: 1,
      },
    ]);

    const report = await runVerify({});
    expect(report.warnings).toContainEqual(
      expect.stringContaining('trump_t2: 12 docs missing L2 Pass 1'),
    );
    expect(report.warnings).toContainEqual(
      expect.stringContaining('trump_t2: 1/10 audit false negatives (10.0%)'),
    );
  });

  it('category filter limits FR warnings to filtered category only', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    // No FR coverage at all — but filter to executiveActions
    mockGetFrPeriodCoverage.mockResolvedValue([]);

    const report = await runVerify({ category: 'executiveActions' });

    // Should only warn about executiveActions, not all 14 categories
    const frWarnings = report.warnings.filter((w) => w.includes('FR documents'));
    expect(frWarnings).toHaveLength(1);
    expect(frWarnings[0]).toContain('executiveActions');
  });
});
