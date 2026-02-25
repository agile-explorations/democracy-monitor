import { describe, it, expect } from 'vitest';
import {
  extractFeedbackEntries,
  aggregateFalsePositives,
  aggregateTierChanges,
  aggregateSuppressions,
  aggregateMissingKeywords,
  detectCategoryFindings,
  buildAggregateReport,
  formatAggregateMarkdown,
} from '@/lib/seed/aggregate-feedback';

function makeResolved(overrides: Record<string, unknown> = {}) {
  return {
    id: 1,
    category: 'judicialIndependence',
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
    expect(entries[0].category).toBe('judicialIndependence');
    expect(entries[0].feedback.falsePositiveKeywords).toEqual(['injunction issued']);
  });

  it('skips entries without resolution', () => {
    const entries = extractFeedbackEntries([
      { id: 1, category: 'judicialIndependence', metadata: {} },
    ]);
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
      {
        category: 'judicialIndependence',
        feedback: { falsePositiveKeywords: ['injunction issued'] },
      },
      {
        category: 'judicialIndependence',
        feedback: { falsePositiveKeywords: ['injunction issued', 'court ordered'] },
      },
      { category: 'judicialIndependence', feedback: { falsePositiveKeywords: ['court ordered'] } },
    ];
    const fpMap = aggregateFalsePositives(entries);
    expect(fpMap.get('injunction issued')!.count).toBe(2);
    expect(fpMap.get('court ordered')!.count).toBe(2);
  });

  it('tracks categories', () => {
    const entries = [
      { category: 'judicialIndependence', feedback: { falsePositiveKeywords: ['emergency'] } },
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
        category: 'judicialIndependence',
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
        category: 'judicialIndependence',
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
      {
        category: 'judicialIndependence',
        feedback: { suppressionSuggestions: ['emergency: routine admin'] },
      },
      {
        category: 'judicialIndependence',
        feedback: { suppressionSuggestions: ['emergency: routine admin'] },
      },
    ];
    const supMap = aggregateSuppressions(entries);
    expect(supMap.get('emergency: routine admin')!.count).toBe(2);
  });
});

describe('extractFeedbackEntries — missingKeywords', () => {
  it('includes entries with only missingKeywords feedback', () => {
    const entries = extractFeedbackEntries([
      makeResolved({
        metadata: {
          resolution: { feedback: { missingKeywords: ['executive overreach'] } },
        },
      }),
    ]);
    expect(entries).toHaveLength(1);
    expect(entries[0].feedback.missingKeywords).toEqual(['executive overreach']);
  });
});

describe('aggregateMissingKeywords', () => {
  it('counts missing keyword occurrences across reviews', () => {
    const entries = [
      { category: 'judicialIndependence', feedback: { missingKeywords: ['judicial crisis'] } },
      {
        category: 'judicialIndependence',
        feedback: { missingKeywords: ['judicial crisis', 'bench warrant'] },
      },
      { category: 'military', feedback: { missingKeywords: ['judicial crisis'] } },
    ];
    const mkMap = aggregateMissingKeywords(entries);
    expect(mkMap.get('judicial crisis')!.count).toBe(3);
    expect(mkMap.get('judicial crisis')!.categories.size).toBe(2);
    expect(mkMap.get('bench warrant')!.count).toBe(1);
  });

  it('lowercases keywords for consistent aggregation', () => {
    const entries = [
      { category: 'judicialIndependence', feedback: { missingKeywords: ['Executive Order'] } },
      { category: 'judicialIndependence', feedback: { missingKeywords: ['executive order'] } },
    ];
    const mkMap = aggregateMissingKeywords(entries);
    expect(mkMap.get('executive order')!.count).toBe(2);
  });

  it('returns empty map when no missing keywords', () => {
    const entries = [
      {
        category: 'judicialIndependence',
        feedback: { falsePositiveKeywords: ['injunction issued'] },
      },
    ];
    expect(aggregateMissingKeywords(entries).size).toBe(0);
  });
});

describe('buildAggregateReport — missing keyword additions', () => {
  it('includes add recommendations for keywords suggested 2+ times', () => {
    const alerts = [
      makeResolved({
        id: 1,
        metadata: {
          resolution: { feedback: { missingKeywords: ['executive overreach'] } },
        },
      }),
      makeResolved({
        id: 2,
        metadata: {
          resolution: { feedback: { missingKeywords: ['executive overreach'] } },
        },
      }),
    ];
    const report = buildAggregateReport(alerts);
    const addRec = report.keywordRecommendations.find(
      (r) => r.action === 'add' && r.keyword === 'executive overreach',
    );
    expect(addRec).toBeDefined();
    expect(addRec!.suggestedTier).toBe('warning');
    expect(addRec!.occurrences).toBe(2);
  });

  it('excludes add recommendations below 2 occurrences', () => {
    const alerts = [
      makeResolved({
        id: 1,
        metadata: {
          resolution: { feedback: { missingKeywords: ['rare keyword'] } },
        },
      }),
    ];
    const report = buildAggregateReport(alerts);
    const addRecs = report.keywordRecommendations.filter((r) => r.action === 'add');
    expect(addRecs).toHaveLength(0);
  });
});

describe('formatAggregateMarkdown — add actions', () => {
  it('renders add action with suggested tier', () => {
    const alerts = [
      makeResolved({
        id: 1,
        metadata: {
          resolution: { feedback: { missingKeywords: ['executive overreach'] } },
        },
      }),
      makeResolved({
        id: 2,
        metadata: {
          resolution: { feedback: { missingKeywords: ['executive overreach'] } },
        },
      }),
    ];
    const report = buildAggregateReport(alerts);
    const md = formatAggregateMarkdown(report);
    expect(md).toContain('| add |');
    expect(md).toContain('executive overreach');
    expect(md).toContain('→ warning');
  });
});

describe('detectCategoryFindings', () => {
  it('detects volume-only triggers when 2+ alerts have no keyword matches', () => {
    const alerts = [
      { id: 1, category: 'infoAvailability', metadata: { keywordMatches: [] } },
      { id: 2, category: 'infoAvailability', metadata: { keywordMatches: [] } },
      { id: 3, category: 'infoAvailability', metadata: { keywordMatches: ['foia denied'] } },
    ];
    const findings = detectCategoryFindings(alerts);
    const volumeFinding = findings.find((f) => f.finding === 'volume-only-triggers');
    expect(volumeFinding).toBeDefined();
    expect(volumeFinding!.category).toBe('infoAvailability');
    expect(volumeFinding!.alertCount).toBe(2);
  });

  it('detects AI consistently overriding keyword status', () => {
    const alerts = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      category: 'judicialIndependence',
      metadata: {
        keywordStatus: 'Drift',
        aiRecommendedStatus: 'Warning',
        resolution: { decision: 'approve' },
      },
    }));
    const findings = detectCategoryFindings(alerts);
    const aiOverride = findings.find((f) => f.finding === 'ai-consistently-overrides');
    expect(aiOverride).toBeDefined();
    expect(aiOverride!.alertCount).toBe(4);
  });

  it('returns empty for categories with no systemic issues', () => {
    const alerts = [
      {
        id: 1,
        category: 'judicialIndependence',
        metadata: { keywordMatches: ['injunction issued'], keywordStatus: 'Warning' },
      },
    ];
    expect(detectCategoryFindings(alerts)).toHaveLength(0);
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
    expect(report.categoryFindings).toHaveLength(0);
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
