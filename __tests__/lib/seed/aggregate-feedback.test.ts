import { describe, it, expect } from 'vitest';
import {
  extractFeedbackEntries,
  aggregateFalsePositives,
  aggregateTierChanges,
  aggregateSuppressions,
  buildAggregateReport,
  formatAggregateMarkdown,
} from '@/lib/seed/aggregate-feedback';

function makeResolved(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    category: 'courts',
    metadata: {
      resolution: {
        decision: 'approve',
        feedback: {
          falsePositiveKeywords: ['injunction issued'],
          suppressionSuggestions: ['injunction issued: routine judicial proceedings'],
        },
      },
    },
    ...overrides,
  };
}

describe('extractFeedbackEntries', () => {
  it('extracts entries with feedback', () => {
    const entries = extractFeedbackEntries([makeResolved()]);
    expect(entries).toHaveLength(1);
    expect(entries[0].category).toBe('courts');
    expect(entries[0].feedback.falsePositiveKeywords).toEqual(['injunction issued']);
  });

  it('skips entries without resolution', () => {
    const entries = extractFeedbackEntries([{ id: 1, category: 'courts', metadata: {} }]);
    expect(entries).toHaveLength(0);
  });

  it('skips entries with empty feedback', () => {
    const entries = extractFeedbackEntries([
      makeResolved({ metadata: { resolution: { feedback: {} } } }),
    ]);
    expect(entries).toHaveLength(0);
  });
});

describe('aggregateFalsePositives', () => {
  it('counts false positive occurrences', () => {
    const entries = [
      { category: 'courts', feedback: { falsePositiveKeywords: ['injunction issued'] } },
      {
        category: 'courts',
        feedback: { falsePositiveKeywords: ['injunction issued', 'court ordered'] },
      },
      { category: 'courts', feedback: { falsePositiveKeywords: ['court ordered'] } },
    ];
    const fpMap = aggregateFalsePositives(entries);
    expect(fpMap.get('injunction issued')!.count).toBe(2);
    expect(fpMap.get('court ordered')!.count).toBe(2);
  });

  it('tracks categories', () => {
    const entries = [
      { category: 'courts', feedback: { falsePositiveKeywords: ['emergency'] } },
      { category: 'military', feedback: { falsePositiveKeywords: ['emergency'] } },
    ];
    const fpMap = aggregateFalsePositives(entries);
    expect(fpMap.get('emergency')!.categories.size).toBe(2);
  });
});

describe('aggregateTierChanges', () => {
  it('aggregates consistent tier changes', () => {
    const entries = [
      {
        category: 'courts',
        feedback: {
          tierChanges: [
            {
              keyword: 'restructuring',
              currentTier: 'drift',
              suggestedTier: 'warning',
              reason: 'Too broad',
            },
          ],
        },
      },
      {
        category: 'courts',
        feedback: {
          tierChanges: [
            {
              keyword: 'restructuring',
              currentTier: 'drift',
              suggestedTier: 'warning',
              reason: 'Too broad',
            },
          ],
        },
      },
    ];
    const tcMap = aggregateTierChanges(entries);
    expect(tcMap.get('restructuring::warning')!.count).toBe(2);
    expect(tcMap.get('restructuring::warning')!.reasons).toEqual(['Too broad']);
  });
});

describe('aggregateSuppressions', () => {
  it('counts suppression pattern occurrences', () => {
    const entries = [
      { category: 'courts', feedback: { suppressionSuggestions: ['emergency: routine admin'] } },
      { category: 'courts', feedback: { suppressionSuggestions: ['emergency: routine admin'] } },
    ];
    const supMap = aggregateSuppressions(entries);
    expect(supMap.get('emergency: routine admin')!.count).toBe(2);
  });
});

describe('buildAggregateReport', () => {
  it('builds report with keyword removal recommendations above threshold', () => {
    // 3 out of 4 reviews flag "injunction issued" as FP (75% > 50%)
    const alerts = [
      makeResolved({ id: 1 }),
      makeResolved({ id: 2 }),
      makeResolved({ id: 3 }),
      makeResolved({
        id: 4,
        metadata: { resolution: { feedback: { falsePositiveKeywords: ['court ordered'] } } },
      }),
    ];
    const report = buildAggregateReport(alerts);
    expect(report.totalResolved).toBe(4);
    expect(report.totalWithFeedback).toBe(4);
    const injunctionRec = report.keywordRecommendations.find(
      (r) => r.keyword === 'injunction issued',
    );
    expect(injunctionRec).toBeDefined();
    expect(injunctionRec!.action).toBe('remove');
    expect(injunctionRec!.fpRate).toBeGreaterThanOrEqual(0.5);
  });

  it('includes suppression recommendations with 2+ occurrences', () => {
    const alerts = [makeResolved({ id: 1 }), makeResolved({ id: 2 })];
    const report = buildAggregateReport(alerts);
    expect(report.suppressionRecommendations.length).toBeGreaterThanOrEqual(1);
    expect(report.suppressionRecommendations[0].pattern).toContain('injunction issued');
  });

  it('excludes tier changes with fewer than 2 occurrences', () => {
    const alerts = [
      makeResolved({
        metadata: {
          resolution: {
            feedback: {
              tierChanges: [{ keyword: 'x', currentTier: 'drift', suggestedTier: 'warning' }],
            },
          },
        },
      }),
    ];
    const report = buildAggregateReport(alerts);
    expect(report.keywordRecommendations.filter((r) => r.action === 'move')).toHaveLength(0);
  });

  it('returns empty report for no resolved alerts', () => {
    const report = buildAggregateReport([]);
    expect(report.totalResolved).toBe(0);
    expect(report.keywordRecommendations).toHaveLength(0);
    expect(report.suppressionRecommendations).toHaveLength(0);
  });
});

describe('formatAggregateMarkdown', () => {
  it('includes header and recommendation table', () => {
    const report = buildAggregateReport([makeResolved({ id: 1 }), makeResolved({ id: 2 })]);
    const md = formatAggregateMarkdown(report);
    expect(md).toContain('# Aggregate Keyword Feedback Report');
    expect(md).toContain('Total resolved reviews: 2');
  });

  it('shows no-recommendations message for empty report', () => {
    const report = buildAggregateReport([]);
    const md = formatAggregateMarkdown(report);
    expect(md).toContain('No actionable recommendations');
  });
});
