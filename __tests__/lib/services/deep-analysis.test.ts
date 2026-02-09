import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnhancedAssessment } from '@/lib/services/ai-assessment-service';
import { enrichWithDeepAnalysis } from '@/lib/services/deep-analysis';
import { runLegalAnalysis } from '@/lib/services/legal-analysis-service';

// Mock the AI/IO services — these are external boundaries
vi.mock('@/lib/services/legal-analysis-service', () => ({
  runLegalAnalysis: vi.fn(),
}));

vi.mock('@/lib/services/trend-anomaly-service', () => ({
  countKeywordsInItems: vi.fn().mockReturnValue({}),
  calculateTrends: vi.fn().mockReturnValue([]),
  detectAnomalies: vi.fn().mockReturnValue([]),
  getBaselineCounts: vi.fn().mockResolvedValue({}),
  recordTrends: vi.fn().mockResolvedValue(undefined),
}));

beforeEach(() => {
  vi.clearAllMocks();
});

function makeAssessment(overrides: Partial<EnhancedAssessment> = {}): EnhancedAssessment {
  return {
    category: 'rule_of_law',
    status: 'Warning',
    reason: 'Test reason',
    matches: [],
    dataCoverage: 0.5,
    evidenceFor: [],
    evidenceAgainst: [],
    howWeCouldBeWrong: [],
    keywordResult: { status: 'Warning', reason: 'Test', matches: [] },
    assessedAt: '2026-02-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('enrichWithDeepAnalysis', () => {
  describe('for Drift/Capture status', () => {
    it('populates legal and trend fields', async () => {
      const legalResult = {
        category: 'rule_of_law',
        status: 'Drift' as const,
        analyses: [],
        summary: 'Legal summary',
      };

      vi.mocked(runLegalAnalysis).mockResolvedValueOnce(legalResult);

      const assessment = makeAssessment({ status: 'Drift' });
      await enrichWithDeepAnalysis(assessment, [{ title: 'Executive order signed' }]);

      expect(assessment.legalAnalysis).toEqual(legalResult);
      expect(assessment.trendAnomalies).toBeDefined();
    });

    it('populates trends even when legal fails', async () => {
      vi.mocked(runLegalAnalysis).mockRejectedValueOnce(new Error('API error'));

      const assessment = makeAssessment({ status: 'Drift' });
      await enrichWithDeepAnalysis(assessment, [{ title: 'test' }]);

      expect(assessment.legalAnalysis).toBeUndefined();
      expect(assessment.trendAnomalies).toBeDefined();
    });
  });

  describe('for non-Drift/Capture status', () => {
    it('does not populate legal for Stable status', async () => {
      const assessment = makeAssessment({ status: 'Stable' });
      await enrichWithDeepAnalysis(assessment, [{ title: 'Normal activity' }]);

      expect(assessment.legalAnalysis).toBeUndefined();
      expect(assessment.trendAnomalies).toBeDefined();
    });

    it('does not populate legal for Warning status', async () => {
      const assessment = makeAssessment({ status: 'Warning' });
      await enrichWithDeepAnalysis(assessment, [{ title: 'Some concern' }]);

      expect(assessment.legalAnalysis).toBeUndefined();
    });

    it('leaves trendAnomalies undefined if trend analysis throws', async () => {
      // Re-mock to throw on countKeywordsInItems
      const { countKeywordsInItems } = await import('@/lib/services/trend-anomaly-service');
      vi.mocked(countKeywordsInItems).mockImplementationOnce(() => {
        throw new Error('trend error');
      });

      const assessment = makeAssessment({ status: 'Stable' });
      await enrichWithDeepAnalysis(assessment, [{ title: 'test' }]);

      expect(assessment.trendAnomalies).toBeUndefined();
    });
  });

  it('ignores empty and missing titles in evidence', async () => {
    vi.mocked(runLegalAnalysis).mockResolvedValueOnce({
      category: 'rule_of_law',
      status: 'Drift' as const,
      analyses: [],
      summary: 'Summary',
    });

    const assessment = makeAssessment({ status: 'Drift' });
    const items = [
      { title: 'Valid title' },
      { title: '' },
      { title: undefined },
      { title: 'Another valid' },
    ];

    await enrichWithDeepAnalysis(assessment, items);

    // If empty titles weren't filtered, the AI services would receive
    // garbage input. The test verifies enrichment succeeds despite bad input.
    expect(assessment.legalAnalysis).toBeDefined();
  });
});
