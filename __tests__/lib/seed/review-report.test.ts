import { describe, it, expect } from 'vitest';
import {
  buildReviewId,
  extractReviewItem,
  sortReviewItems,
  formatSummaryTable,
  formatReviewItem,
  formatReportMarkdown,
  buildGapExplanation,
  parseCliArgs,
} from '@/lib/seed/review-report';
import type { EnhancedAssessment } from '@/lib/types';

function makeAssessment(overrides: Partial<EnhancedAssessment> = {}): EnhancedAssessment {
  return {
    category: 'courts',
    status: 'Warning',
    reason: 'Test reason',
    matches: ['keyword-a'],
    dataCoverage: 0.5,
    evidenceFor: [],
    evidenceAgainst: [],
    howWeCouldBeWrong: [],
    keywordResult: { status: 'Warning', reason: 'Test', matches: ['keyword-a'] },
    assessedAt: '2024-06-15T00:00:00Z',
    ...overrides,
  };
}

describe('buildReviewId', () => {
  it('produces category--date format', () => {
    expect(buildReviewId('courts', '2024-06-15')).toBe('courts--2024-06-15');
    expect(buildReviewId('military', '2024-01-01')).toBe('military--2024-01-01');
  });
});

describe('extractReviewItem', () => {
  it('returns item when flaggedForReview is true', () => {
    const item = extractReviewItem(
      makeAssessment({
        flaggedForReview: true,
        recommendedStatus: 'Stable',
        aiResult: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          status: 'Stable',
          reasoning: 'Looks fine',
          confidence: 0.5,
          tokensUsed: { input: 10, output: 20 },
          latencyMs: 100,
        },
      }),
    );
    expect(item).not.toBeNull();
    expect(item!.category).toBe('courts');
    expect(item!.keywordStatus).toBe('Warning');
    expect(item!.aiRecommendedStatus).toBe('Stable');
    expect(item!.confidence).toBe(0.5);
  });

  it('returns null when flaggedForReview is false', () => {
    const item = extractReviewItem(makeAssessment({ flaggedForReview: false }));
    expect(item).toBeNull();
  });

  it('returns null when flaggedForReview is undefined', () => {
    const item = extractReviewItem(makeAssessment());
    expect(item).toBeNull();
  });

  it('includes keyword verdicts as nested context', () => {
    const item = extractReviewItem(
      makeAssessment({
        flaggedForReview: true,
        keywordReview: [
          { keyword: 'emergency', assessment: 'false_positive', reasoning: 'Routine use' },
          { keyword: 'deploy', assessment: 'genuine_concern', reasoning: 'Real concern' },
        ],
      }),
    );
    expect(item).not.toBeNull();
    expect(item!.topMatches).toHaveLength(2);
    expect(item!.topMatches[0].keyword).toBe('emergency');
    expect(item!.topMatches[0].assessment).toBe('false_positive');
  });
});

describe('buildGapExplanation', () => {
  it('explains large gap (2+ levels)', () => {
    const explanation = buildGapExplanation('Capture', 'Stable', 0.9);
    expect(explanation).toContain('3 levels');
    expect(explanation).toContain('large gap');
  });

  it('explains low confidence', () => {
    const explanation = buildGapExplanation('Warning', 'Stable', 0.5);
    expect(explanation).toContain('50%');
    expect(explanation).toContain('below 70%');
  });

  it('explains missing AI recommendation', () => {
    const explanation = buildGapExplanation('Warning', undefined, undefined);
    expect(explanation).toContain('no recommendation');
  });

  it('provides generic explanation for 1-level gap with low confidence', () => {
    const explanation = buildGapExplanation('Warning', 'Stable', 0.6);
    expect(explanation).toContain('below 70%');
  });
});

describe('sortReviewItems', () => {
  it('sorts by category, then date descending', () => {
    const items = [
      { id: 'military--2024-01-01', category: 'military', date: '2024-01-01' },
      { id: 'courts--2024-06-01', category: 'courts', date: '2024-06-01' },
      { id: 'courts--2024-07-01', category: 'courts', date: '2024-07-01' },
    ].map((base) => ({
      ...base,
      keywordStatus: 'Warning',
      finalStatus: 'Warning',
      gapExplanation: '',
      keywordMatches: [],
      topMatches: [],
    }));

    const sorted = sortReviewItems(items);
    expect(sorted.map((i) => i.id)).toEqual([
      'courts--2024-07-01',
      'courts--2024-06-01',
      'military--2024-01-01',
    ]);
  });
});

describe('formatSummaryTable', () => {
  it('counts by category', () => {
    const items = [
      { id: 'a', category: 'courts', date: 'd' },
      { id: 'b', category: 'courts', date: 'd' },
      { id: 'c', category: 'military', date: 'd' },
    ].map((base) => ({
      ...base,
      keywordStatus: 'Warning',
      finalStatus: 'Warning',
      gapExplanation: '',
      keywordMatches: [],
      topMatches: [],
    }));

    const table = formatSummaryTable(items);
    expect(table).toContain('| courts | 2 |');
    expect(table).toContain('| military | 1 |');
    expect(table).toContain('| **Total** | **3** |');
  });
});

describe('formatReviewItem', () => {
  it('shows keyword vs AI status, confidence, reasoning', () => {
    const md = formatReviewItem({
      id: 'courts--2024-06-01',
      category: 'courts',
      date: '2024-06-01',
      keywordStatus: 'Warning',
      aiRecommendedStatus: 'Stable',
      finalStatus: 'Warning',
      confidence: 0.85,
      aiReasoning: 'AI thinks this is fine',
      gapExplanation: 'AI recommends Stable vs keyword Warning',
      keywordMatches: ['emergency'],
      topMatches: [
        { keyword: 'emergency', assessment: 'false_positive', reasoning: 'Routine use' },
      ],
    });
    expect(md).toContain('### courts--2024-06-01');
    expect(md).toContain('**Keyword Status:** Warning');
    expect(md).toContain('**AI Recommended:** Stable');
    expect(md).toContain('**Confidence:** 85%');
    expect(md).toContain('AI thinks this is fine');
    expect(md).toContain('`emergency`');
  });
});

describe('parseCliArgs', () => {
  it('parses --out flag with value', () => {
    const opts = parseCliArgs(['--out', './my-dir']);
    expect(opts.outDir).toBe('./my-dir');
  });

  it('parses --interactive flag', () => {
    const opts = parseCliArgs(['--interactive']);
    expect(opts.interactive).toBe(true);
  });

  it('parses --approve-ai flag', () => {
    const opts = parseCliArgs(['--approve-ai']);
    expect(opts.approveAi).toBe(true);
  });

  it('parses --reviewer flag with value', () => {
    const opts = parseCliArgs(['--reviewer', 'Alice']);
    expect(opts.reviewer).toBe('Alice');
  });

  it('parses --status flag', () => {
    const opts = parseCliArgs(['--status']);
    expect(opts.status).toBe(true);
  });

  it('parses --export flag', () => {
    const opts = parseCliArgs(['--export']);
    expect(opts.exportJson).toBe(true);
  });

  it('parses --reset flag', () => {
    const opts = parseCliArgs(['--reset']);
    expect(opts.reset).toBe(true);
  });

  it('parses --aggregate flag', () => {
    const opts = parseCliArgs(['--aggregate']);
    expect(opts.aggregate).toBe(true);
  });

  it('parses multiple flags together', () => {
    const opts = parseCliArgs(['--approve-ai', '--reviewer', 'Bob', '--out', '/tmp']);
    expect(opts.approveAi).toBe(true);
    expect(opts.reviewer).toBe('Bob');
    expect(opts.outDir).toBe('/tmp');
  });

  it('returns empty options for no args', () => {
    const opts = parseCliArgs([]);
    expect(opts).toEqual({});
  });
});

describe('formatReportMarkdown', () => {
  it('produces a complete report with header, summary, and items', () => {
    const items = [
      {
        id: 'courts--2024-06-01',
        category: 'courts',
        date: '2024-06-01',
        keywordStatus: 'Warning',
        finalStatus: 'Warning',
        gapExplanation: 'Test gap',
        keywordMatches: [],
        topMatches: [],
      },
    ];
    const report = formatReportMarkdown(items);
    expect(report).toContain('# AI Skeptic Review Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('## Review Items');
    expect(report).toContain('### courts--2024-06-01');
  });
});
