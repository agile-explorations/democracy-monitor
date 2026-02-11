import { describe, it, expect } from 'vitest';
import {
  buildFlagId,
  extractFlaggedItems,
  sortFlaggedItems,
  formatReportMarkdown,
  buildDecisionsTemplate,
  formatSummaryTable,
  formatFlaggedItem,
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

describe('buildFlagId', () => {
  it('produces deterministic composite IDs', () => {
    expect(buildFlagId('courts', '2024-06-15', 'downgrade', 0)).toBe(
      'courts--2024-06-15--downgrade--0',
    );
    expect(buildFlagId('military', '2024-01-01', 'false-positive', 2)).toBe(
      'military--2024-01-01--false-positive--2',
    );
  });
});

describe('extractFlaggedItems', () => {
  it('flags downgrade when downgradeApplied is true', () => {
    const items = extractFlaggedItems(
      makeAssessment({
        downgradeApplied: true,
        recommendedStatus: 'Stable',
        aiResult: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          status: 'Stable',
          reasoning: 'Looks fine',
          confidence: 0.9,
          tokensUsed: { input: 10, output: 20 },
          latencyMs: 100,
        },
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0].flagType).toBe('downgrade');
    expect(items[0].recommendedStatus).toBe('Stable');
  });

  it('flags downgrade when flaggedForReview is true', () => {
    const items = extractFlaggedItems(makeAssessment({ flaggedForReview: true }));
    expect(items.some((i) => i.flagType === 'downgrade')).toBe(true);
  });

  it('flags false_positive keywords', () => {
    const items = extractFlaggedItems(
      makeAssessment({
        keywordReview: [
          { keyword: 'emergency', assessment: 'false_positive', reasoning: 'Routine use' },
          { keyword: 'deploy', assessment: 'genuine_concern', reasoning: 'Actual concern' },
        ],
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0].flagType).toBe('false-positive');
    expect(items[0].keyword).toBe('emergency');
  });

  it('flags ambiguous keywords', () => {
    const items = extractFlaggedItems(
      makeAssessment({
        keywordReview: [
          { keyword: 'reform', assessment: 'ambiguous', reasoning: 'Could go either way' },
        ],
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0].flagType).toBe('ambiguous');
  });

  it('flags low confidence when no downgrade', () => {
    const items = extractFlaggedItems(
      makeAssessment({
        aiResult: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          status: 'Warning',
          reasoning: 'Uncertain',
          confidence: 0.5,
          tokensUsed: { input: 10, output: 20 },
          latencyMs: 100,
        },
      }),
    );
    expect(items).toHaveLength(1);
    expect(items[0].flagType).toBe('low-confidence');
  });

  it('skips low-confidence when downgrade is present', () => {
    const items = extractFlaggedItems(
      makeAssessment({
        downgradeApplied: true,
        aiResult: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          status: 'Stable',
          reasoning: 'Hmm',
          confidence: 0.3,
          tokensUsed: { input: 10, output: 20 },
          latencyMs: 100,
        },
      }),
    );
    const flagTypes = items.map((i) => i.flagType);
    expect(flagTypes).toContain('downgrade');
    expect(flagTypes).not.toContain('low-confidence');
  });

  it('returns empty for clean assessment', () => {
    const items = extractFlaggedItems(
      makeAssessment({
        aiResult: {
          provider: 'openai',
          model: 'gpt-4o-mini',
          status: 'Warning',
          reasoning: 'OK',
          confidence: 0.9,
          tokensUsed: { input: 10, output: 20 },
          latencyMs: 100,
        },
        keywordReview: [{ keyword: 'test', assessment: 'genuine_concern', reasoning: 'Real' }],
      }),
    );
    expect(items).toHaveLength(0);
  });
});

describe('sortFlaggedItems', () => {
  it('sorts by category, then flag type severity, then date descending', () => {
    const items = [
      {
        id: 'b',
        category: 'military',
        date: '2024-01-01',
        flagType: 'downgrade' as const,
        status: 'Warning',
        detail: '',
      },
      {
        id: 'a',
        category: 'courts',
        date: '2024-06-01',
        flagType: 'ambiguous' as const,
        status: 'Warning',
        detail: '',
      },
      {
        id: 'c',
        category: 'courts',
        date: '2024-06-01',
        flagType: 'downgrade' as const,
        status: 'Warning',
        detail: '',
      },
      {
        id: 'd',
        category: 'courts',
        date: '2024-07-01',
        flagType: 'downgrade' as const,
        status: 'Warning',
        detail: '',
      },
    ];
    const sorted = sortFlaggedItems(items);
    expect(sorted.map((i) => i.id)).toEqual(['d', 'c', 'a', 'b']);
  });
});

describe('formatSummaryTable', () => {
  it('produces a markdown table with counts', () => {
    const items = [
      {
        id: 'a',
        category: 'c',
        date: 'd',
        flagType: 'downgrade' as const,
        status: 's',
        detail: '',
      },
      {
        id: 'b',
        category: 'c',
        date: 'd',
        flagType: 'downgrade' as const,
        status: 's',
        detail: '',
      },
      {
        id: 'c',
        category: 'c',
        date: 'd',
        flagType: 'false-positive' as const,
        status: 's',
        detail: '',
      },
    ];
    const table = formatSummaryTable(items);
    expect(table).toContain('| downgrade | 2 |');
    expect(table).toContain('| false-positive | 1 |');
    expect(table).toContain('| **Total** | **3** |');
  });
});

describe('formatFlaggedItem', () => {
  it('includes all relevant fields', () => {
    const md = formatFlaggedItem({
      id: 'courts--2024-06-01--downgrade--0',
      category: 'courts',
      date: '2024-06-01',
      flagType: 'downgrade',
      status: 'Warning',
      recommendedStatus: 'Stable',
      detail: 'AI thinks this is fine',
      confidence: 0.85,
    });
    expect(md).toContain('### courts--2024-06-01--downgrade--0');
    expect(md).toContain('**Recommended:** Stable');
    expect(md).toContain('**Confidence:** 85%');
    expect(md).toContain('AI thinks this is fine');
  });
});

describe('formatReportMarkdown', () => {
  it('produces a complete report with header, summary, and items', () => {
    const items = [
      {
        id: 'a',
        category: 'courts',
        date: '2024-06-01',
        flagType: 'downgrade' as const,
        status: 'Warning',
        detail: 'Detail A',
      },
    ];
    const report = formatReportMarkdown(items);
    expect(report).toContain('# AI Skeptic Review Report');
    expect(report).toContain('## Summary');
    expect(report).toContain('## Flagged Items');
    expect(report).toContain('### a');
  });
});

describe('buildDecisionsTemplate', () => {
  it('creates a template with all items as pending', () => {
    const items = [
      {
        id: 'a',
        category: 'c',
        date: 'd',
        flagType: 'downgrade' as const,
        status: 's',
        detail: '',
      },
      {
        id: 'b',
        category: 'c',
        date: 'd',
        flagType: 'ambiguous' as const,
        status: 's',
        detail: '',
      },
    ];
    const template = buildDecisionsTemplate(items);
    expect(template.metadata.totalItems).toBe(2);
    expect(template.decisions).toHaveLength(2);
    expect(template.decisions.every((d) => d.decision === 'pending')).toBe(true);
  });
});
