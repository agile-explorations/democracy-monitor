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

// ---------------------------------------------------------------------------
// Additional branch coverage tests
// ---------------------------------------------------------------------------

describe('extractFeedbackEntries — edge cases', () => {
  it('skips alert with null metadata', () => {
    const entries = extractFeedbackEntries([{ id: 1, category: 'test', metadata: null }]);
    expect(entries).toHaveLength(0);
  });

  it('skips alert with resolution but no feedback field', () => {
    const entries = extractFeedbackEntries([
      { id: 1, category: 'test', metadata: { resolution: { decision: 'approve' } } },
    ]);
    expect(entries).toHaveLength(0);
  });

  it('includes entry with only tierChanges feedback', () => {
    const entries = extractFeedbackEntries([
      {
        id: 1,
        category: 'test',
        metadata: {
          resolution: {
            feedback: {
              tierChanges: [
                {
                  keyword: 'x',
                  currentTier: 'drift',
                  suggestedTier: 'warning',
                  reason: 'too broad',
                },
              ],
            },
          },
        },
      },
    ]);
    expect(entries).toHaveLength(1);
  });

  it('includes entry with only suppressionSuggestions feedback', () => {
    const entries = extractFeedbackEntries([
      {
        id: 1,
        category: 'test',
        metadata: {
          resolution: {
            feedback: {
              suppressionSuggestions: ['pattern: reason'],
            },
          },
        },
      },
    ]);
    expect(entries).toHaveLength(1);
  });
});

describe('aggregateFalsePositives — edge cases', () => {
  it('returns empty map for entries with no falsePositiveKeywords', () => {
    const entries = [{ category: 'test', feedback: { missingKeywords: ['something'] } }];
    const fpMap = aggregateFalsePositives(entries);
    expect(fpMap.size).toBe(0);
  });

  it('computes total correctly across multiple categories', () => {
    const entries = [
      { category: 'catA', feedback: { falsePositiveKeywords: ['kw1'] } },
      { category: 'catA', feedback: { falsePositiveKeywords: ['kw1'] } },
      { category: 'catB', feedback: { falsePositiveKeywords: ['kw1'] } },
    ];
    const fpMap = aggregateFalsePositives(entries);
    const data = fpMap.get('kw1')!;
    // catA has 2 reviews, catB has 1 review => total = 3
    expect(data.count).toBe(3);
    expect(data.total).toBe(3);
    expect(data.categories.size).toBe(2);
  });

  it('lowercases keywords for consistent aggregation', () => {
    const entries = [
      { category: 'catA', feedback: { falsePositiveKeywords: ['Emergency'] } },
      { category: 'catA', feedback: { falsePositiveKeywords: ['emergency'] } },
    ];
    const fpMap = aggregateFalsePositives(entries);
    expect(fpMap.get('emergency')!.count).toBe(2);
    expect(fpMap.has('Emergency')).toBe(false);
  });
});

describe('aggregateTierChanges — edge cases', () => {
  it('returns empty map when entries have no tierChanges', () => {
    const entries = [{ category: 'test', feedback: { falsePositiveKeywords: ['x'] } }];
    const tcMap = aggregateTierChanges(entries);
    expect(tcMap.size).toBe(0);
  });

  it('deduplicates reasons', () => {
    const entries = [
      {
        category: 'test',
        feedback: {
          tierChanges: [
            { keyword: 'x', currentTier: 'drift', suggestedTier: 'warning', reason: 'same reason' },
          ],
        },
      },
      {
        category: 'test',
        feedback: {
          tierChanges: [
            { keyword: 'x', currentTier: 'drift', suggestedTier: 'warning', reason: 'same reason' },
          ],
        },
      },
    ];
    const tcMap = aggregateTierChanges(entries);
    const data = tcMap.get('x::warning')!;
    expect(data.count).toBe(2);
    expect(data.reasons).toEqual(['same reason']);
  });

  it('handles tierChange without a reason', () => {
    const entries = [
      {
        category: 'test',
        feedback: {
          tierChanges: [{ keyword: 'y', currentTier: 'capture', suggestedTier: 'drift' }],
        },
      },
    ];
    const tcMap = aggregateTierChanges(entries);
    const data = tcMap.get('y::drift')!;
    expect(data.count).toBe(1);
    expect(data.reasons).toEqual([]);
  });

  it('accumulates different reasons', () => {
    const entries = [
      {
        category: 'test',
        feedback: {
          tierChanges: [
            { keyword: 'z', currentTier: 'drift', suggestedTier: 'warning', reason: 'reason A' },
          ],
        },
      },
      {
        category: 'test',
        feedback: {
          tierChanges: [
            { keyword: 'z', currentTier: 'drift', suggestedTier: 'warning', reason: 'reason B' },
          ],
        },
      },
    ];
    const tcMap = aggregateTierChanges(entries);
    const data = tcMap.get('z::warning')!;
    expect(data.reasons).toEqual(['reason A', 'reason B']);
  });
});

describe('aggregateSuppressions — edge cases', () => {
  it('returns empty map for entries without suppressionSuggestions', () => {
    const entries = [{ category: 'test', feedback: { falsePositiveKeywords: ['x'] } }];
    const supMap = aggregateSuppressions(entries);
    expect(supMap.size).toBe(0);
  });
});

describe('aggregateMissingKeywords — edge cases', () => {
  it('returns empty map for empty entries', () => {
    const mkMap = aggregateMissingKeywords([]);
    expect(mkMap.size).toBe(0);
  });
});

describe('detectCategoryFindings — edge cases', () => {
  it('returns empty for empty alerts array', () => {
    expect(detectCategoryFindings([])).toHaveLength(0);
  });

  it('does not flag volume-only when fewer than 2 alerts have no keyword matches', () => {
    const alerts = [
      { id: 1, category: 'test', metadata: { keywordMatches: [] } },
      { id: 2, category: 'test', metadata: { keywordMatches: ['something'] } },
    ];
    const findings = detectCategoryFindings(alerts);
    expect(findings.find((f) => f.finding === 'volume-only-triggers')).toBeUndefined();
  });

  it('does not flag AI overrides when fewer than 3 meet criteria', () => {
    const alerts = [
      {
        id: 1,
        category: 'test',
        metadata: {
          keywordStatus: 'Drift',
          aiRecommendedStatus: 'Warning',
          resolution: { decision: 'approve' },
        },
      },
      {
        id: 2,
        category: 'test',
        metadata: {
          keywordStatus: 'Drift',
          aiRecommendedStatus: 'Warning',
          resolution: { decision: 'approve' },
        },
      },
    ];
    const findings = detectCategoryFindings(alerts);
    expect(findings.find((f) => f.finding === 'ai-consistently-overrides')).toBeUndefined();
  });

  it('handles alert with null metadata for keyword matching check', () => {
    const alerts = [
      { id: 1, category: 'test', metadata: null },
      { id: 2, category: 'test', metadata: null },
    ];
    const findings = detectCategoryFindings(alerts);
    // null metadata -> no keywordMatches -> counted as volume-only
    const volumeFinding = findings.find((f) => f.finding === 'volume-only-triggers');
    expect(volumeFinding).toBeDefined();
    expect(volumeFinding!.alertCount).toBe(2);
  });

  it('does not count AI overrides when decision is not approve', () => {
    const alerts = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      category: 'test',
      metadata: {
        keywordStatus: 'Drift',
        aiRecommendedStatus: 'Warning',
        keywordMatches: ['something'],
        resolution: { decision: 'override' },
      },
    }));
    const findings = detectCategoryFindings(alerts);
    expect(findings.find((f) => f.finding === 'ai-consistently-overrides')).toBeUndefined();
  });

  it('does not count AI overrides when statuses match', () => {
    const alerts = Array.from({ length: 4 }, (_, i) => ({
      id: i + 1,
      category: 'test',
      metadata: {
        keywordStatus: 'Warning',
        aiRecommendedStatus: 'Warning',
        keywordMatches: ['something'],
        resolution: { decision: 'approve' },
      },
    }));
    const findings = detectCategoryFindings(alerts);
    expect(findings.find((f) => f.finding === 'ai-consistently-overrides')).toBeUndefined();
  });

  it('sorts findings by alertCount descending', () => {
    const alerts = [
      // Category A: 3 volume-only
      ...Array.from({ length: 3 }, (_, i) => ({
        id: i + 1,
        category: 'catA',
        metadata: { keywordMatches: [] },
      })),
      // Category B: 2 volume-only
      ...Array.from({ length: 2 }, (_, i) => ({
        id: i + 10,
        category: 'catB',
        metadata: { keywordMatches: [] },
      })),
    ];
    const findings = detectCategoryFindings(alerts);
    expect(findings.length).toBe(2);
    expect(findings[0].alertCount).toBeGreaterThanOrEqual(findings[1].alertCount);
    expect(findings[0].category).toBe('catA');
  });
});

describe('buildAggregateReport — FP threshold boundary', () => {
  it('includes removal at exactly FP_THRESHOLD (50%)', () => {
    // 2 entries total in same category (both have some feedback content),
    // 1 flags 'kw1' as FP -> rate = 1/2 = 0.5
    const alerts = [
      {
        id: 1,
        category: 'catA',
        metadata: {
          resolution: { feedback: { falsePositiveKeywords: ['kw1'] } },
        },
      },
      {
        id: 2,
        category: 'catA',
        metadata: {
          resolution: { feedback: { missingKeywords: ['other'] } },
        },
      },
    ];
    const report = buildAggregateReport(alerts);
    const rec = report.keywordRecommendations.find(
      (r) => r.keyword === 'kw1' && r.action === 'remove',
    );
    expect(rec).toBeDefined();
    expect(rec!.fpRate).toBe(0.5);
  });

  it('excludes removal below FP_THRESHOLD', () => {
    // 3 entries total in same category (all with feedback content),
    // 1 flags 'kw1' as FP -> rate = 1/3 = 0.33
    const alerts = [
      {
        id: 1,
        category: 'catA',
        metadata: {
          resolution: { feedback: { falsePositiveKeywords: ['kw1'] } },
        },
      },
      {
        id: 2,
        category: 'catA',
        metadata: {
          resolution: { feedback: { missingKeywords: ['other1'] } },
        },
      },
      {
        id: 3,
        category: 'catA',
        metadata: {
          resolution: { feedback: { missingKeywords: ['other2'] } },
        },
      },
    ];
    const report = buildAggregateReport(alerts);
    const rec = report.keywordRecommendations.find(
      (r) => r.keyword === 'kw1' && r.action === 'remove',
    );
    expect(rec).toBeUndefined();
  });

  it('handles FP data with total computed from category review counts', () => {
    const entries = [{ category: 'catA', feedback: { falsePositiveKeywords: ['orphan'] } }];
    const fpMap = aggregateFalsePositives(entries);
    const data = fpMap.get('orphan')!;
    // total should be 1 since catA has 1 review
    expect(data.total).toBe(1);
  });
});

describe('buildAggregateReport — tier change with no reason', () => {
  it('shows "no reason given" when reason array is empty', () => {
    const alerts = [
      {
        id: 1,
        category: 'test',
        metadata: {
          resolution: {
            feedback: {
              tierChanges: [{ keyword: 'x', currentTier: 'drift', suggestedTier: 'warning' }],
            },
          },
        },
      },
      {
        id: 2,
        category: 'test',
        metadata: {
          resolution: {
            feedback: {
              tierChanges: [{ keyword: 'x', currentTier: 'drift', suggestedTier: 'warning' }],
            },
          },
        },
      },
    ];
    const report = buildAggregateReport(alerts);
    const moveRec = report.keywordRecommendations.find(
      (r) => r.action === 'move' && r.keyword === 'x',
    );
    expect(moveRec).toBeDefined();
    expect(moveRec!.reason).toContain('no reason given');
  });
});

describe('buildAggregateReport — suppression threshold', () => {
  it('excludes suppression patterns below 2 occurrences', () => {
    const alerts = [
      {
        id: 1,
        category: 'test',
        metadata: {
          resolution: {
            feedback: {
              suppressionSuggestions: ['unique-pattern: one-time'],
            },
          },
        },
      },
    ];
    const report = buildAggregateReport(alerts);
    const suppRec = report.suppressionRecommendations.find(
      (r) => r.pattern === 'unique-pattern: one-time',
    );
    expect(suppRec).toBeUndefined();
  });
});

describe('formatAggregateMarkdown — all sections', () => {
  it('renders move action with current and suggested tier', () => {
    const report = buildAggregateReport([
      {
        id: 1,
        category: 'test',
        metadata: {
          resolution: {
            feedback: {
              tierChanges: [
                {
                  keyword: 'term',
                  currentTier: 'drift',
                  suggestedTier: 'warning',
                  reason: 'Too broad',
                },
              ],
            },
          },
        },
      },
      {
        id: 2,
        category: 'test',
        metadata: {
          resolution: {
            feedback: {
              tierChanges: [
                {
                  keyword: 'term',
                  currentTier: 'drift',
                  suggestedTier: 'warning',
                  reason: 'Too broad',
                },
              ],
            },
          },
        },
      },
    ]);
    const md = formatAggregateMarkdown(report);
    expect(md).toContain('| move |');
    expect(md).toContain('drift → warning');
  });

  it('renders suppression section when present', () => {
    const alerts = [makeResolved({ id: 1 }), makeResolved({ id: 2 })];
    const report = buildAggregateReport(alerts);
    const md = formatAggregateMarkdown(report);
    expect(md).toContain('## Suppression Pattern Recommendations');
  });

  it('renders category findings section when present', () => {
    const alerts = [
      { id: 1, category: 'test', metadata: { keywordMatches: [] } },
      { id: 2, category: 'test', metadata: { keywordMatches: [] } },
    ];
    const report = buildAggregateReport(alerts);
    const md = formatAggregateMarkdown(report);
    expect(md).toContain('## Category-Level Findings');
    expect(md).toContain('volume-only-triggers');
  });

  it('omits suppression section when empty', () => {
    const report = buildAggregateReport([
      {
        id: 1,
        category: 'catA',
        metadata: {
          resolution: { feedback: { missingKeywords: ['term'] } },
        },
      },
      {
        id: 2,
        category: 'catA',
        metadata: {
          resolution: { feedback: { missingKeywords: ['term'] } },
        },
      },
    ]);
    const md = formatAggregateMarkdown(report);
    expect(md).not.toContain('## Suppression Pattern Recommendations');
  });

  it('omits category findings section when empty', () => {
    const alerts = [makeResolved({ id: 1 }), makeResolved({ id: 2 })];
    const report = buildAggregateReport(alerts);
    // Category findings require 2+ no-keyword-match or 3+ AI override
    // makeResolved alerts have resolution.feedback, not keywordMatches metadata at top level
    // So we need alerts with keyword matches to avoid volume-only
    const cleanAlerts = [
      {
        id: 1,
        category: 'test',
        metadata: {
          keywordMatches: ['something'],
          resolution: { feedback: { missingKeywords: ['term'] } },
        },
      },
      {
        id: 2,
        category: 'test',
        metadata: {
          keywordMatches: ['something'],
          resolution: { feedback: { missingKeywords: ['term'] } },
        },
      },
    ];
    const cleanReport = buildAggregateReport(cleanAlerts);
    const md = formatAggregateMarkdown(cleanReport);
    expect(md).not.toContain('## Category-Level Findings');
  });

  it('renders remove action with FP rate', () => {
    const alerts = [makeResolved({ id: 1 }), makeResolved({ id: 2 })];
    const report = buildAggregateReport(alerts);
    const md = formatAggregateMarkdown(report);
    expect(md).toContain('| remove |');
    expect(md).toContain('FP rate:');
  });
});
