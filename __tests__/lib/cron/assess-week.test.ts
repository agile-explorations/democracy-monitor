import { describe, it, expect, vi, beforeEach } from 'vitest';
import { assessWeek } from '@/lib/cron/assess-week';
import type { AiOptions } from '@/lib/cron/assess-week';
import type { ContentItem, EnhancedAssessment } from '@/lib/types';

vi.mock('@/lib/services/assessment-service', () => ({
  analyzeContent: vi.fn().mockReturnValue({
    status: 'Warning',
    reason: 'Keyword match: executive order',
    matches: ['executive order'],
  }),
}));

vi.mock('@/lib/services/ai-assessment-service', () => ({
  enhancedAssessment: vi.fn().mockResolvedValue({
    category: 'executiveAuthority',
    status: 'Warning',
    reason: 'AI reviewed: executive order appears in context',
    matches: ['executive order'],
    dataCoverage: 0.5,
    evidenceFor: [{ text: 'Executive order issued', direction: 'concerning' }],
    evidenceAgainst: [],
    howWeCouldBeWrong: ['Context may be routine'],
    keywordResult: { status: 'Warning', reason: 'Keyword match', matches: ['executive order'] },
    aiResult: {
      provider: 'openai',
      model: 'gpt-4o-mini',
      status: 'Warning',
      reasoning: 'Reviewed',
      confidence: 0.8,
      tokensUsed: 500,
      latencyMs: 200,
    },
    assessedAt: '2026-01-20T00:00:00.000Z',
  } satisfies EnhancedAssessment),
}));

const { analyzeContent } = await import('@/lib/services/assessment-service');
const { enhancedAssessment } = await import('@/lib/services/ai-assessment-service');

const baseItems: ContentItem[] = [
  { title: 'Executive Order on Workforce', link: 'https://example.com/eo1', pubDate: '2026-01-15' },
  { title: 'Agency Restructuring Plan', link: 'https://example.com/plan1', pubDate: '2026-01-16' },
];

describe('assessWeek', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses keyword-only assessment when skipAi is true', async () => {
    const aiOptions: AiOptions = { skipAi: true };
    const result = await assessWeek(baseItems, 'executiveAuthority', '2026-01-20', aiOptions);

    expect(analyzeContent).toHaveBeenCalledWith(baseItems, 'executiveAuthority');
    expect(enhancedAssessment).not.toHaveBeenCalled();
    expect(result.status).toBe('Warning');
    expect(result.aiResult).toBeUndefined();
  });

  it('builds correct keyword-only result structure', async () => {
    const aiOptions: AiOptions = { skipAi: true };
    const result = await assessWeek(baseItems, 'courts', '2026-01-20', aiOptions);

    expect(result.category).toBe('courts');
    expect(result.matches).toEqual(['executive order']);
    expect(result.evidenceFor).toEqual([]);
    expect(result.evidenceAgainst).toEqual([]);
    expect(result.howWeCouldBeWrong).toEqual([]);
    expect(result.assessedAt).toBe('2026-01-20T00:00:00.000Z');
  });

  it('computes dataCoverage from item count', async () => {
    const aiOptions: AiOptions = { skipAi: true };
    const result = await assessWeek(baseItems, 'courts', '2026-01-20', aiOptions);

    // 2 items / 10 = 0.2, capped at 1
    expect(result.dataCoverage).toBe(0.2);
  });

  it('caps dataCoverage at 1 for large item counts', async () => {
    const manyItems = Array.from({ length: 15 }, (_, i) => ({
      title: `Doc ${i}`,
      link: `https://example.com/${i}`,
    }));
    const aiOptions: AiOptions = { skipAi: true };
    const result = await assessWeek(manyItems, 'courts', '2026-01-20', aiOptions);

    expect(result.dataCoverage).toBe(1);
  });

  it('uses enhancedAssessment when skipAi is false', async () => {
    const aiOptions: AiOptions = { skipAi: false };
    const result = await assessWeek(baseItems, 'executiveAuthority', '2026-01-20', aiOptions);

    expect(enhancedAssessment).toHaveBeenCalledWith(baseItems, 'executiveAuthority', {
      skipCache: true,
    });
    expect(analyzeContent).not.toHaveBeenCalled();
    expect(result.aiResult).toBeDefined();
    expect(result.aiResult?.provider).toBe('openai');
  });

  it('passes model option to enhancedAssessment', async () => {
    const aiOptions: AiOptions = { skipAi: false, model: 'gpt-4o-mini' };
    await assessWeek(baseItems, 'executiveAuthority', '2026-01-20', aiOptions);

    expect(enhancedAssessment).toHaveBeenCalledWith(baseItems, 'executiveAuthority', {
      skipCache: true,
      model: 'gpt-4o-mini',
    });
  });

  it('does not include model when not specified', async () => {
    const aiOptions: AiOptions = { skipAi: false };
    await assessWeek(baseItems, 'executiveAuthority', '2026-01-20', aiOptions);

    expect(enhancedAssessment).toHaveBeenCalledWith(baseItems, 'executiveAuthority', {
      skipCache: true,
    });
  });

  it('returns zero dataCoverage for empty items (keyword-only)', async () => {
    const aiOptions: AiOptions = { skipAi: true };
    vi.mocked(analyzeContent).mockReturnValueOnce({
      status: 'Stable',
      reason: 'No data',
      matches: [],
    });
    const result = await assessWeek([], 'courts', '2026-01-20', aiOptions);

    expect(result.dataCoverage).toBe(0);
    expect(result.status).toBe('Stable');
  });
});
