import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { EnhancedAssessment } from '@/lib/services/ai-assessment-service';
import { runDebate } from '@/lib/services/debate-service';
import { enrichWithDeepAnalysis } from '@/lib/services/deep-analysis';
import { runLegalAnalysis } from '@/lib/services/legal-analysis-service';
import { detectAnomalies } from '@/lib/services/trend-anomaly-service';

// Mock all downstream services
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
    it('runs debate, legal, and trend analysis', async () => {
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
      const anomalies = [
        {
          keyword: 'executive order',
          category: 'rule_of_law',
          currentCount: 10,
          baselineCount: 2,
          zScore: 3.5,
          direction: 'increase' as const,
          severity: 'high' as const,
        },
      ];

      vi.mocked(runDebate).mockResolvedValueOnce(debateResult);
      vi.mocked(runLegalAnalysis).mockResolvedValueOnce(legalResult);
      vi.mocked(detectAnomalies).mockReturnValueOnce(anomalies);

      const assessment = makeAssessment({ status: 'Drift' });
      const items = [{ title: 'Executive order signed' }, { title: 'Court ruling blocked' }];

      await enrichWithDeepAnalysis(assessment, items);

      expect(runDebate).toHaveBeenCalledWith('rule_of_law', 'Drift', [
        'Executive order signed',
        'Court ruling blocked',
      ]);
      expect(runLegalAnalysis).toHaveBeenCalledWith('rule_of_law', 'Drift', [
        'Executive order signed',
        'Court ruling blocked',
      ]);
      expect(assessment.debate).toEqual(debateResult);
      expect(assessment.legalAnalysis).toEqual(legalResult);
      expect(assessment.trendAnomalies).toEqual(anomalies);
    });

    it('handles debate failure gracefully', async () => {
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
    });

    it('handles legal analysis failure gracefully', async () => {
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
      expect(assessment.legalAnalysis).toBeUndefined();
    });
  });

  describe('for non-Drift/Capture status', () => {
    it('only runs trend analysis for Stable status', async () => {
      const assessment = makeAssessment({ status: 'Stable' });

      await enrichWithDeepAnalysis(assessment, [{ title: 'Normal activity' }]);

      expect(runDebate).not.toHaveBeenCalled();
      expect(runLegalAnalysis).not.toHaveBeenCalled();
      expect(assessment.trendAnomalies).toBeDefined();
    });

    it('only runs trend analysis for Warning status', async () => {
      const assessment = makeAssessment({ status: 'Warning' });

      await enrichWithDeepAnalysis(assessment, [{ title: 'Some concern' }]);

      expect(runDebate).not.toHaveBeenCalled();
      expect(runLegalAnalysis).not.toHaveBeenCalled();
    });

    it('handles trend analysis failure gracefully', async () => {
      vi.mocked(detectAnomalies).mockImplementationOnce(() => {
        throw new Error('trend error');
      });

      const assessment = makeAssessment({ status: 'Stable' });

      // Should not throw
      await enrichWithDeepAnalysis(assessment, [{ title: 'test' }]);

      expect(assessment.trendAnomalies).toBeUndefined();
    });
  });

  it('filters out empty titles from evidence', async () => {
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

    expect(runDebate).toHaveBeenCalledWith('rule_of_law', 'Drift', [
      'Valid title',
      'Another valid',
    ]);
  });
});
