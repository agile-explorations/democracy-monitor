import { describe, it, expect } from 'vitest';
import type { BaselineConfig } from '@/lib/data/baselines';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import {
  detectSourceAsymmetry,
  compareCategoryAcrossBaselines,
  summarizeCycleFindings,
  buildValidationReport,
  formatValidationMarkdown,
} from '@/lib/seed/baseline-validation';
import type { BaselineStats, CategoryComparison } from '@/lib/seed/baseline-validation';

// --- Test data ---

function makeStats(overrides?: Partial<BaselineStats>): BaselineStats {
  return {
    baselineId: 'test_baseline',
    label: 'Test Baseline',
    cycleYear: 2,
    administration: 'test',
    availableSources: ['federal_register', 'whitehouse', 'gdelt'],
    categories: [],
    ...overrides,
  };
}

const bidenYear2: BaselineStats = makeStats({
  baselineId: 'biden_2022',
  label: 'Biden 2022–23',
  cycleYear: 2,
  administration: 'biden',
  categories: [
    {
      category: 'courts',
      avgWeeklySeverity: 10,
      stddevWeeklySeverity: 3,
      avgWeeklyDocCount: 20,
      weekCount: 52,
      alertCount: 2,
    },
    {
      category: 'executiveActions',
      avgWeeklySeverity: 5,
      stddevWeeklySeverity: 2,
      avgWeeklyDocCount: 15,
      weekCount: 52,
      alertCount: 1,
    },
  ],
});

const bidenYear1: BaselineStats = makeStats({
  baselineId: 'biden_2021',
  label: 'Biden 2021–22',
  cycleYear: 1,
  administration: 'biden',
  categories: [
    {
      category: 'courts',
      avgWeeklySeverity: 18,
      stddevWeeklySeverity: 5,
      avgWeeklyDocCount: 35,
      weekCount: 52,
      alertCount: 5,
    },
    {
      category: 'executiveActions',
      avgWeeklySeverity: 12,
      stddevWeeklySeverity: 4,
      avgWeeklyDocCount: 30,
      weekCount: 52,
      alertCount: 3,
    },
  ],
});

const trumpYear1: BaselineStats = makeStats({
  baselineId: 'trump_2017',
  label: 'Trump 2017–18',
  cycleYear: 1,
  administration: 'trump',
  categories: [
    {
      category: 'courts',
      avgWeeklySeverity: 14,
      stddevWeeklySeverity: 4,
      avgWeeklyDocCount: 18,
      weekCount: 52,
      alertCount: 3,
    },
    {
      category: 'executiveActions',
      avgWeeklySeverity: 8,
      stddevWeeklySeverity: 3,
      avgWeeklyDocCount: 12,
      weekCount: 52,
      alertCount: 2,
    },
  ],
});

const frOnlyStats: BaselineStats = makeStats({
  baselineId: 'test_fr_only',
  label: 'FR Only Test',
  cycleYear: 1,
  administration: 'test',
  availableSources: ['federal_register'],
  categories: [
    {
      category: 'courts',
      avgWeeklySeverity: 12,
      stddevWeeklySeverity: 3,
      avgWeeklyDocCount: 10,
      weekCount: 52,
      alertCount: 2,
    },
  ],
});

// --- Tests ---

describe('detectSourceAsymmetry', () => {
  it('returns empty array when all baselines have same sources', () => {
    const configs: BaselineConfig[] = [
      { ...BASELINE_CONFIGS[0], availableSources: ['federal_register', 'gdelt'] },
      { ...BASELINE_CONFIGS[1], availableSources: ['federal_register', 'gdelt'] },
    ];
    expect(detectSourceAsymmetry(configs)).toEqual([]);
  });

  it('returns empty for live configs (all have uniform sources)', () => {
    expect(detectSourceAsymmetry(BASELINE_CONFIGS)).toEqual([]);
  });

  it('detects missing sources and includes source notes', () => {
    const configs: BaselineConfig[] = [
      { ...BASELINE_CONFIGS[0] },
      {
        ...BASELINE_CONFIGS[2],
        availableSources: ['federal_register'],
        sourceNotes: 'GDELT unavailable',
      },
    ];
    const warnings = detectSourceAsymmetry(configs);
    expect(warnings.length).toBeGreaterThan(0);
    const gdeltWarning = warnings.find((w) => w.includes('gdelt'));
    expect(gdeltWarning).toBeTruthy();
    expect(gdeltWarning).toContain('GDELT unavailable');
  });
});

describe('compareCategoryAcrossBaselines', () => {
  it('computes severity and volume ratios for Year 1 vs Year 2', () => {
    const result = compareCategoryAcrossBaselines('courts', [bidenYear2, bidenYear1]);

    expect(result.category).toBe('courts');
    expect(result.baselines).toHaveLength(2);
    // Year 1 severity (18) / Year 2 severity (10) = 1.8
    expect(result.severityRatio).toBeCloseTo(1.8, 1);
    // Year 1 volume (35) / Year 2 volume (20) = 1.75
    expect(result.volumeRatio).toBeCloseTo(1.75, 1);
  });

  it('averages multiple Year 1 baselines', () => {
    const result = compareCategoryAcrossBaselines('courts', [bidenYear2, bidenYear1, trumpYear1]);

    // Average Year 1 severity: (18 + 14) / 2 = 16
    // Year 2 severity: 10
    // Ratio: 16 / 10 = 1.6
    expect(result.severityRatio).toBeCloseTo(1.6, 1);
  });

  it('returns null ratios when only one cycle year exists', () => {
    const result = compareCategoryAcrossBaselines('courts', [bidenYear1, trumpYear1]);

    expect(result.severityRatio).toBeNull();
    expect(result.volumeRatio).toBeNull();
  });

  it('detects source asymmetry', () => {
    const result = compareCategoryAcrossBaselines('courts', [
      bidenYear2,
      frOnlyStats, // FR only
    ]);

    expect(result.sourceAsymmetry).toBe(true);
  });

  it('returns no asymmetry when sources match', () => {
    const result = compareCategoryAcrossBaselines('courts', [bidenYear2, bidenYear1]);

    expect(result.sourceAsymmetry).toBe(false);
  });

  it('handles category missing from some baselines', () => {
    const statsWithExtra = makeStats({
      baselineId: 'extra',
      cycleYear: 1,
      categories: [
        {
          category: 'military',
          avgWeeklySeverity: 5,
          stddevWeeklySeverity: 1,
          avgWeeklyDocCount: 3,
          weekCount: 52,
          alertCount: 0,
        },
      ],
    });

    const result = compareCategoryAcrossBaselines('military', [bidenYear2, statsWithExtra]);
    expect(result.baselines).toHaveLength(1); // Only the one with military data
  });
});

describe('summarizeCycleFindings', () => {
  it('reports high severity ratios', () => {
    const comparisons: CategoryComparison[] = [
      {
        category: 'courts',
        baselines: [],
        severityRatio: 2.0,
        volumeRatio: 1.8,
        sourceAsymmetry: false,
      },
    ];

    const findings = summarizeCycleFindings(comparisons);
    expect(findings.some((f) => f.includes('>1.5x severity'))).toBe(true);
    expect(findings.some((f) => f.includes('courts (2.0x)'))).toBe(true);
  });

  it('reports low severity ratios', () => {
    const comparisons: CategoryComparison[] = [
      {
        category: 'fiscal',
        baselines: [],
        severityRatio: 0.5,
        volumeRatio: 0.6,
        sourceAsymmetry: false,
      },
    ];

    const findings = summarizeCycleFindings(comparisons);
    expect(findings.some((f) => f.includes('<0.75x severity'))).toBe(true);
  });

  it('reports no significant cycle effects', () => {
    const comparisons: CategoryComparison[] = [
      {
        category: 'courts',
        baselines: [],
        severityRatio: 1.1,
        volumeRatio: 1.0,
        sourceAsymmetry: false,
      },
    ];

    const findings = summarizeCycleFindings(comparisons);
    expect(findings.some((f) => f.includes('Cycle effects are small'))).toBe(true);
  });

  it('warns about source asymmetry in comparisons', () => {
    const comparisons: CategoryComparison[] = [
      {
        category: 'courts',
        baselines: [],
        severityRatio: 1.8,
        volumeRatio: 1.5,
        sourceAsymmetry: true,
      },
    ];

    const findings = summarizeCycleFindings(comparisons);
    expect(findings.some((f) => f.includes('Source asymmetry warning'))).toBe(true);
  });

  it('handles no comparisons possible', () => {
    const comparisons: CategoryComparison[] = [
      {
        category: 'courts',
        baselines: [],
        severityRatio: null,
        volumeRatio: null,
        sourceAsymmetry: false,
      },
    ];

    const findings = summarizeCycleFindings(comparisons);
    expect(findings.some((f) => f.includes('No Year 1 vs Year 2 comparison'))).toBe(true);
  });
});

describe('buildValidationReport', () => {
  it('builds report from multiple baselines with uniform sources', () => {
    const report = buildValidationReport([bidenYear2, bidenYear1, trumpYear1]);

    expect(report.baselineCount).toBe(3);
    expect(report.comparisons).toHaveLength(2); // courts + executiveActions
    expect(report.sourceAsymmetryWarnings).toEqual([]);
    expect(report.cycleYearFindings.length).toBeGreaterThan(0);
  });

  it('includes source asymmetry warnings when sources differ', () => {
    const report = buildValidationReport([bidenYear2, frOnlyStats]);

    expect(report.sourceAsymmetryWarnings.length).toBeGreaterThan(0);
  });

  it('sorts comparisons by divergence from 1.0 ratio', () => {
    const report = buildValidationReport([bidenYear2, bidenYear1]);

    // executiveActions has higher ratio (12/5=2.4) than courts (18/10=1.8)
    expect(report.comparisons[0].category).toBe('executiveActions');
    expect(report.comparisons[1].category).toBe('courts');
  });

  it('handles single baseline', () => {
    const report = buildValidationReport([bidenYear2]);

    expect(report.baselineCount).toBe(1);
    expect(report.comparisons).toHaveLength(2);
    // No Year 1 data, so all ratios are null
    expect(report.comparisons.every((c) => c.severityRatio === null)).toBe(true);
  });
});

describe('formatValidationMarkdown', () => {
  it('produces markdown with all sections', () => {
    const report = buildValidationReport([bidenYear2, bidenYear1, trumpYear1]);
    const md = formatValidationMarkdown(report);

    expect(md).toContain('# Cross-Baseline Validation Report');
    expect(md).toContain('## Baseline Overview');
    expect(md).toContain('## Category Comparison');
    expect(md).toContain('## Cycle-Year Findings');
    expect(md).toContain('Biden 2022');
    expect(md).toContain('Biden 2021');
    expect(md).toContain('Trump 2017');
  });

  it('includes source asymmetry section when warnings exist', () => {
    const report = buildValidationReport([bidenYear2, frOnlyStats]);
    const md = formatValidationMarkdown(report);

    expect(md).toContain('## Source Asymmetry Warnings');
  });
});
