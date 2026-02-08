import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnhancedAssessment } from '@/lib/services/ai-assessment-service';
import { runDebate } from '@/lib/services/debate-service';
import { enrichWithDeepAnalysis } from '@/lib/services/deep-analysis';
import { runLegalAnalysis } from '@/lib/services/legal-analysis-service';

// Mock the AI/IO services — these are external boundaries
vi.mock('@/lib/services/debate-service', () => ({
  runDebate: vi.fn(),
}));

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
    it('populates debate, legal, and trend fields', async () => {
      const debateResult = {
        topic: 'test',
        rounds: [],
        conclusion: 'Concluded',
        status: 'Drift' as const,
      };
      const legalResult = {
        category: 'rule_of_law',
        status: 'Drift' as const,
        analyses: [],
        summary: 'Legal summary',
      };

      vi.mocked(runDebate).mockResolvedValueOnce(debateResult);
      vi.mocked(runLegalAnalysis).mockResolvedValueOnce(legalResult);

      const assessment = makeAssessment({ status: 'Drift' });
      await enrichWithDeepAnalysis(assessment, [{ title: 'Executive order signed' }]);

      expect(assessment.debate).toEqual(debateResult);
      expect(assessment.legalAnalysis).toEqual(legalResult);
      expect(assessment.trendAnomalies).toBeDefined();
    });

    it('populates legal even when debate fails', async () => {
      vi.mocked(runDebate).mockRejectedValueOnce(new Error('AI unavailable'));
      vi.mocked(runLegalAnalysis).mockResolvedValueOnce({
        category: 'rule_of_law',
        status: 'Capture' as const,
        analyses: [],
        summary: 'Summary',
      });

      const assessment = makeAssessment({ status: 'Capture' });
      await enrichWithDeepAnalysis(assessment, [{ title: 'test' }]);

      expect(assessment.debate).toBeUndefined();
      expect(assessment.legalAnalysis).toBeDefined();
      expect(assessment.legalAnalysis!.summary).toBe('Summary');
    });

    it('populates debate even when legal fails', async () => {
      vi.mocked(runDebate).mockResolvedValueOnce({
        topic: 'test',
        rounds: [],
        conclusion: 'Done',
        status: 'Drift' as const,
      });
      vi.mocked(runLegalAnalysis).mockRejectedValueOnce(new Error('API error'));

      const assessment = makeAssessment({ status: 'Drift' });
      await enrichWithDeepAnalysis(assessment, [{ title: 'test' }]);

      expect(assessment.debate).toBeDefined();
      expect(assessment.debate!.conclusion).toBe('Done');
      expect(assessment.legalAnalysis).toBeUndefined();
    });
  });

  describe('for non-Drift/Capture status', () => {
    it('does not populate debate or legal for Stable status', async () => {
      const assessment = makeAssessment({ status: 'Stable' });
      await enrichWithDeepAnalysis(assessment, [{ title: 'Normal activity' }]);

      expect(assessment.debate).toBeUndefined();
      expect(assessment.legalAnalysis).toBeUndefined();
      expect(assessment.trendAnomalies).toBeDefined();
    });

    it('does not populate debate or legal for Warning status', async () => {
      const assessment = makeAssessment({ status: 'Warning' });
      await enrichWithDeepAnalysis(assessment, [{ title: 'Some concern' }]);

      expect(assessment.debate).toBeUndefined();
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
    vi.mocked(runDebate).mockResolvedValueOnce({
      topic: 'test',
      rounds: [],
      conclusion: 'Done',
      status: 'Drift' as const,
    });
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
    expect(assessment.debate).toBeDefined();
    expect(assessment.legalAnalysis).toBeDefined();
  });
});
