import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runVerify } from '@/lib/cron/backfill-verify';

vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn().mockReturnValue(true),
}));

const mockGetContentCompleteness = vi.fn().mockResolvedValue([]);
const mockGetDocumentCoverage = vi.fn().mockResolvedValue([]);
const mockGetStageCompleteness = vi.fn().mockResolvedValue({
  totalDocuments: 100,
  missingScores: 0,
  missingEmbeddings: 0,
  metadataOnlyCount: 0,
  totalWeeks: 10,
  missingAggregates: 0,
});
const mockGetBaselineCompleteness = vi.fn().mockResolvedValue([]);
const mockGetLayer2Completeness = vi.fn().mockResolvedValue([]);
const mockGetPaginationFitness = vi.fn().mockResolvedValue([]);
const mockGetFrPeriodCoverage = vi.fn().mockResolvedValue([]);
const mockGetGdeltCrossfeedCoverage = vi.fn().mockResolvedValue([]);
const mockGetContentCompletenessByOrigin = vi.fn().mockResolvedValue([]);
const mockGetClOpinionCoverage = vi.fn().mockResolvedValue(null);

vi.mock('@/lib/services/backfill-source-coverage', () => ({
  getPaginationFitness: (...args: unknown[]) => mockGetPaginationFitness(...args),
  getFrPeriodCoverage: (...args: unknown[]) => mockGetFrPeriodCoverage(...args),
  getGdeltCrossfeedCoverage: (...args: unknown[]) => mockGetGdeltCrossfeedCoverage(...args),
}));

vi.mock('@/lib/services/backfill-verification-service', () => ({
  getContentCompleteness: (...args: unknown[]) => mockGetContentCompleteness(...args),
  getContentCompletenessByOrigin: (...args: unknown[]) =>
    mockGetContentCompletenessByOrigin(...args),
  getDocumentCoverage: (...args: unknown[]) => mockGetDocumentCoverage(...args),
  getStageCompleteness: (...args: unknown[]) => mockGetStageCompleteness(...args),
  getBaselineCompleteness: (...args: unknown[]) => mockGetBaselineCompleteness(...args),
  getLayer2Completeness: (...args: unknown[]) => mockGetLayer2Completeness(...args),
  getClOpinionCoverage: (...args: unknown[]) => mockGetClOpinionCoverage(...args),
  CONTENT_FIXABLE_TYPES: new Set(['Presidential Document', 'congressional_report']),
  CONTENT_FIXABLE_ORIGINS: new Map([['whitehouse', 'wh']]),
}));

describe('backfill-verify', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset all mock return values that tests may override
    mockGetContentCompleteness.mockResolvedValue([]);
    mockGetContentCompletenessByOrigin.mockResolvedValue([]);
    mockGetDocumentCoverage.mockResolvedValue([]);
    mockGetStageCompleteness.mockResolvedValue({
      totalDocuments: 100,
      missingScores: 0,
      missingEmbeddings: 0,
      metadataOnlyCount: 0,
      totalWeeks: 10,
      missingAggregates: 0,
    });
    mockGetBaselineCompleteness.mockResolvedValue([]);
    mockGetLayer2Completeness.mockResolvedValue([]);
    mockGetPaginationFitness.mockResolvedValue([]);
    mockGetFrPeriodCoverage.mockResolvedValue([]);
    mockGetGdeltCrossfeedCoverage.mockResolvedValue([]);
    mockGetClOpinionCoverage.mockResolvedValue(null);
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
      metadataOnlyCount: 0,
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
      metadataOnlyCount: 0,
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
      metadataOnlyCount: 0,
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
      { category: 'civilLiberties', sourceOrigin: 'courtlistener', peakWeeklyCount: 950 },
    ]);

    const report = await runVerify({});
    expect(report.warnings).toContainEqual(
      expect.stringContaining('civilLiberties CourtListener peak=950 hits pagination cap 900'),
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
        pass2Assessed: 15,
        missingPass2: 0,
        pass2Flagged: 2,
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

  it('warns for fixable null-content source types with backfill command', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    mockGetContentCompleteness.mockResolvedValue([
      { sourceType: 'Presidential Document', total: 5000, nullContent: 2586 },
      { sourceType: 'congressional_report', total: 3800, nullContent: 3251 },
    ]);

    const report = await runVerify({});
    expect(report.warnings).toContainEqual(
      expect.stringContaining('2586 Presidential Document docs have null content'),
    );
    expect(report.warnings).toContainEqual(
      expect.stringContaining('pnpm backfill:content --source fr'),
    );
    expect(report.warnings).toContainEqual(
      expect.stringContaining('3251 congressional_report docs have null content'),
    );
    expect(report.warnings).toContainEqual(
      expect.stringContaining('pnpm backfill:content --source govinfo'),
    );
  });

  it('warns for WH origin null-content via contentCompletenessByOrigin', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    mockGetContentCompletenessByOrigin.mockResolvedValue([
      { sourceType: 'whitehouse', total: 4200, nullContent: 3800 },
    ]);

    const report = await runVerify({});
    expect(report.warnings).toContainEqual(
      expect.stringContaining('3800 whitehouse docs have null content'),
    );
    expect(report.warnings).toContainEqual(
      expect.stringContaining('pnpm backfill:content --source wh'),
    );
  });

  it('does not warn for non-fixable null-content source types', async () => {
    const { isDbAvailable } = await import('@/lib/db');
    vi.mocked(isDbAvailable).mockReturnValue(true);

    mockGetContentCompleteness.mockResolvedValue([
      { sourceType: 'docket_entry', total: 160000, nullContent: 23456 },
    ]);

    const report = await runVerify({});
    const contentWarnings = report.warnings.filter((w) => w.includes('null content'));
    expect(contentWarnings).toHaveLength(0);
  });
});
