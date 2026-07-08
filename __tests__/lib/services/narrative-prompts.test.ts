import { describe, it, expect } from 'vitest';
import {
  formatTrajectorySummary,
  formatDocumentSection,
} from '@/lib/services/narrative-format-helpers';
import {
  buildDraftPrompt,
  buildFeedbackPrompt,
  buildRevisionPrompt,
  buildWeeklySummaryPrompt,
  buildTermSummaryPrompt,
} from '@/lib/services/narrative-prompts';
import type { WeeklySummaryInput, TermSummaryInput } from '@/lib/types';
import type { ConcernAssessment } from '@/lib/types/structural';
import { makeLayerData } from '../../fixtures/narrative-layer-data';

describe('buildDraftPrompt', () => {
  it('includes category name and week', () => {
    const prompt = buildDraftPrompt(makeLayerData());
    expect(prompt).toContain('Government Worker Protections');
    expect(prompt).toContain('2026-02-17');
  });

  it('includes layer assessment summary', () => {
    const prompt = buildDraftPrompt(makeLayerData());
    expect(prompt).toContain('LAYER ASSESSMENT SUMMARY');
    expect(prompt).toContain('L1 Structural');
    expect(prompt).toContain('L2 AI Assessment');
    expect(prompt).toContain('L3 Thematic Drift');
  });

  it('includes dual output format instructions', () => {
    const prompt = buildDraftPrompt(makeLayerData());
    expect(prompt).toContain('=== EXPERT NARRATIVE ===');
    expect(prompt).toContain('=== PUBLIC NARRATIVE ===');
  });

  it('includes document context when provided', () => {
    const data = makeLayerData({
      documentContext: [
        {
          title: 'Test Executive Order',
          sourceType: 'federal_register',
          sourceOrigin: 'FR',
          agency: 'DOJ',
          publishedAt: '2026-02-18',
          url: 'https://example.com',
          assessment: 'clearly_concerning',
          erosionType: 'formal_override',
          reasoning: 'Test reasoning.',
          content: 'Full text...',
        },
      ],
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('Test Executive Order');
    expect(prompt).toContain('KEY DOCUMENTS');
  });

  it('includes baseline context when provided', () => {
    const data = makeLayerData({
      baselineContext: {
        avgDocsPerWeek: 25.5,
        avgP2ConcernRate: 0.03,
        structuralScoreRange: '0.10-0.30',
      },
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('BASELINE CONTEXT');
    expect(prompt).toContain('25.5');
  });

  it('includes trajectory when provided', () => {
    const data = makeLayerData({
      trajectory: { previousWeekStatus: 'Stable', consecutiveWeeksAtStatus: 1 },
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('TRAJECTORY');
    expect(prompt).toContain('Stable');
  });
});

describe('buildFeedbackPrompt', () => {
  it('includes both drafts and source data', () => {
    const prompt = buildFeedbackPrompt('Expert draft.', 'Public draft.', makeLayerData());
    expect(prompt).toContain('Expert draft.');
    expect(prompt).toContain('Public draft.');
    expect(prompt).toContain('LAYER ASSESSMENT SUMMARY');
  });

  it('includes all 6 review categories', () => {
    const prompt = buildFeedbackPrompt('Expert', 'Public', makeLayerData());
    expect(prompt).toContain('FACTUAL ACCURACY');
    expect(prompt).toContain('CONFIDENCE CALIBRATION');
    expect(prompt).toContain('MISSING COUNTER-ARGUMENTS');
    expect(prompt).toContain('CHARACTERIZATION CONCERNS');
    expect(prompt).toContain('BALANCE');
    expect(prompt).toContain('EVIDENCE SUFFICIENCY');
  });

  it('includes small-sample criterion (h) when doc count < 20', () => {
    const small = buildFeedbackPrompt('E', 'P', makeLayerData({ totalDocumentCount: 9 }));
    expect(small).toContain('(h) SMALL SAMPLE SIZE');
    expect(small).toContain('9 documents');

    const large = buildFeedbackPrompt('E', 'P', makeLayerData({ totalDocumentCount: 50 }));
    expect(large).not.toContain('(h) SMALL SAMPLE SIZE');
  });

  it('always includes counter-argument count criterion', () => {
    const small = buildFeedbackPrompt('E', 'P', makeLayerData({ totalDocumentCount: 9 }));
    expect(small).toContain('(i) COUNTER-ARGUMENT COUNT');

    const large = buildFeedbackPrompt('E', 'P', makeLayerData({ totalDocumentCount: 50 }));
    expect(large).toContain('(h) COUNTER-ARGUMENT COUNT');
  });
});

describe('buildRevisionPrompt', () => {
  it('includes drafts, feedback, and source data', () => {
    const prompt = buildRevisionPrompt(
      'Expert draft.',
      'Public draft.',
      'Feedback.',
      makeLayerData(),
    );
    expect(prompt).toContain('Expert draft.');
    expect(prompt).toContain('Public draft.');
    expect(prompt).toContain('Feedback.');
    expect(prompt).toContain('LAYER ASSESSMENT SUMMARY');
  });

  it('includes dual output format for revision', () => {
    const prompt = buildRevisionPrompt('E', 'P', 'F', makeLayerData());
    expect(prompt).toContain('=== EXPERT NARRATIVE ===');
    expect(prompt).toContain('=== PUBLIC NARRATIVE ===');
  });

  it('includes revision instructions with criterion range matching doc count', () => {
    const smallSample = buildRevisionPrompt('E', 'P', 'F', makeLayerData());
    expect(smallSample).toContain('REVISION INSTRUCTIONS');
    expect(smallSample).toContain('feedback item (a through i)');

    const largeSample = buildRevisionPrompt(
      'E',
      'P',
      'F',
      makeLayerData({ totalDocumentCount: 50 }),
    );
    expect(largeSample).toContain('feedback item (a through h)');
  });
});

describe('buildWeeklySummaryPrompt', () => {
  function makeWeeklyInput(overrides: Partial<WeeklySummaryInput> = {}): WeeklySummaryInput {
    return {
      weekOf: '2026-02-17',
      categories: [
        makeLayerData(),
        makeLayerData({
          category: 'fiscal',
          categoryTitle: 'Spending Oversight',
          convergenceDetail: {
            status: 'Stable',
            structuralElevated: false,
            aiElevated: false,
            thematicElevated: false,
            layersElevated: 0,
            pattern: 'none',
            bootstrap: false,
          } as ConcernAssessment,
        }),
      ],
      categoryNarratives: new Map([
        ['civilService', { expert: 'Expert narrative', public: 'Public narrative' }],
      ]),
      failedCategories: [],
      previousWeekSummary: null,
      ...overrides,
    };
  }

  it('includes week and category counts', () => {
    const prompt = buildWeeklySummaryPrompt(makeWeeklyInput(), 'expert');
    expect(prompt).toContain('2026-02-17');
    expect(prompt).toContain('Total categories monitored: 2');
  });

  it('includes elevated and stable sections', () => {
    const prompt = buildWeeklySummaryPrompt(makeWeeklyInput(), 'expert');
    expect(prompt).toContain('ELEVATED+ CATEGORIES');
    expect(prompt).toContain('STABLE CATEGORIES');
  });

  it('includes category narratives in elevated section', () => {
    const prompt = buildWeeklySummaryPrompt(makeWeeklyInput(), 'expert');
    expect(prompt).toContain('Expert narrative');
  });

  it('notes failed categories', () => {
    const input = makeWeeklyInput({ failedCategories: ['elections'] });
    const prompt = buildWeeklySummaryPrompt(input, 'expert');
    expect(prompt).toContain('FAILED NARRATIVE GENERATION');
    expect(prompt).toContain('elections');
  });

  it('includes previous week summary when available', () => {
    const input = makeWeeklyInput({
      previousWeekSummary: { expert: 'Prior expert.', public: 'Prior public.' },
    });
    const prompt = buildWeeklySummaryPrompt(input, 'expert');
    expect(prompt).toContain('PREVIOUS WEEK SUMMARY');
    expect(prompt).toContain('Prior expert.');
  });

  it('uses public narrative for public version', () => {
    const input = makeWeeklyInput({
      previousWeekSummary: { expert: 'Prior expert.', public: 'Prior public.' },
    });
    const prompt = buildWeeklySummaryPrompt(input, 'public');
    expect(prompt).toContain('Prior public.');
    expect(prompt).not.toContain('Prior expert.');
  });
});

describe('buildTermSummaryPrompt', () => {
  function makeTermInput(overrides: Partial<TermSummaryInput> = {}): TermSummaryInput {
    return {
      weekOf: '2026-02-17',
      weeklySummary: { expert: 'This week expert.', public: 'This week public.' },
      significantWeeks: [
        {
          weekOf: '2026-01-20',
          reasons: ['Peak concern: 4 of 5 categories at Confirmed Concern'],
          excerpt: 'Inauguration week excerpt.',
        },
        {
          weekOf: '2026-02-10',
          reasons: ['Free and Fair Elections entered Confirmed Concern'],
          excerpt: null,
        },
      ],
      trajectoryTable: [
        { category: 'civilService', weekOf: '2026-02-10', status: 'Stable' },
        { category: 'civilService', weekOf: '2026-02-17', status: 'Elevated' },
      ],
      statistics: {
        weeksPerStatus: [
          { category: 'civilService', stable: 3, elevated: 1, divergent: 0, confirmedConcern: 0 },
        ],
        peakConvergenceWeek: '2026-02-17',
        currentTrend: [{ category: 'civilService', direction: 'worsening' }],
      },
      ...overrides,
    };
  }

  it('includes the current week', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).toContain('2026-02-17');
  });

  it('includes weekly summary', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).toContain("THIS WEEK'S SUMMARY");
    expect(prompt).toContain('This week expert.');
  });

  it('includes trajectory summary', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).toContain('TRAJECTORY SUMMARY');
    expect(prompt).toContain('civilService');
  });

  it('includes statistics', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).toContain('KEY STATISTICS');
    expect(prompt).toContain('Peak convergence week: 2026-02-17');
    expect(prompt).toContain('worsening');
  });

  it('includes the significant-weeks digest with reasons and excerpts', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).toContain('SIGNIFICANT WEEKS');
    expect(prompt).toContain('2026-01-20: Peak concern: 4 of 5 categories at Confirmed Concern');
    expect(prompt).toContain('Weekly summary excerpt: Inauguration week excerpt.');
    expect(prompt).toContain('2026-02-10: Free and Fair Elections entered Confirmed Concern');
  });

  it('shows a placeholder when no significant weeks are identified', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput({ significantWeeks: [] }), 'expert');
    expect(prompt).toContain('SIGNIFICANT WEEKS');
    expect(prompt).toContain('None identified for this term.');
  });

  it('does not reference a previous term summary', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).not.toContain('PREVIOUS TERM SUMMARY');
  });

  it('uses public weekly summary for public version', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'public');
    expect(prompt).toContain('This week public.');
    expect(prompt).not.toContain('This week expert.');
  });

  it('handles empty trajectory table', () => {
    const input = makeTermInput({ trajectoryTable: [] });
    const prompt = buildTermSummaryPrompt(input, 'expert');
    expect(prompt).toContain('TRAJECTORY SUMMARY');
    expect(prompt).toContain('No trajectory data available.');
  });

  it('handles null peakConvergenceWeek', () => {
    const input = makeTermInput({
      statistics: {
        weeksPerStatus: [
          { category: 'civilService', stable: 3, elevated: 0, divergent: 0, confirmedConcern: 0 },
        ],
        peakConvergenceWeek: null,
        currentTrend: [],
      },
    });
    const prompt = buildTermSummaryPrompt(input, 'expert');
    expect(prompt).not.toContain('Peak convergence week');
  });

  it('handles empty currentTrend', () => {
    const input = makeTermInput({
      statistics: {
        weeksPerStatus: [
          { category: 'civilService', stable: 3, elevated: 0, divergent: 0, confirmedConcern: 0 },
        ],
        peakConvergenceWeek: null,
        currentTrend: [],
      },
    });
    const prompt = buildTermSummaryPrompt(input, 'expert');
    expect(prompt).not.toContain('Current trend direction');
  });

  it('includes word range for expert version', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).toContain('600-1000');
    expect(prompt).toContain('technical');
  });

  it('includes word range for public version', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'public');
    expect(prompt).toContain('400-700');
    expect(prompt).toContain('plain-language');
  });
});

// ---------------------------------------------------------------------------
// Additional branch coverage tests
// ---------------------------------------------------------------------------

describe('buildDraftPrompt — missing branch coverage', () => {
  it('shows fallback when convergenceDetail is null', () => {
    const data = makeLayerData({ convergenceDetail: null });
    const prompt = buildDraftPrompt(data);
    // formatConvergenceBlock returns 'Convergence data: unavailable.'
    expect(prompt).toContain('Convergence data: unavailable.');
    // layersFiredSummary returns 'Convergence data unavailable.' (no colon)
    // but it is called from within formatConvergenceBlock which short-circuits
    // so the fired summary won't appear separately — just verify the block text
  });

  it('shows no-layers-elevated when all layers are false', () => {
    const data = makeLayerData({
      convergenceDetail: {
        status: 'Stable',
        structuralElevated: false,
        aiElevated: false,
        thematicElevated: false,
        layersElevated: 0,
        pattern: 'none',
        bootstrap: false,
      } as ConcernAssessment,
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('No layers elevated.');
  });

  it('shows active and descriptive layers', () => {
    const data = makeLayerData({
      convergenceDetail: {
        status: 'ConfirmedConcern',
        structuralElevated: true,
        aiElevated: true,
        silenceElevated: true,
        thematicElevated: true,
        layersElevated: 2,
        pattern: 'full convergence',
        bootstrap: false,
      },
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('L2 AI content assessment');
    expect(prompt).toContain('L1v2 silence (source health indicator)');
    expect(prompt).toContain('L1 structural anomaly');
    expect(prompt).toContain('L3 thematic drift');
    expect(prompt).toContain('Active detection layers elevated');
    expect(prompt).toContain('Descriptive context elevated');
  });

  it('shows bootstrap note when convergence is in bootstrap mode', () => {
    const data = makeLayerData({
      convergenceDetail: {
        status: 'Elevated',
        structuralElevated: true,
        aiElevated: false,
        thematicElevated: false,
        layersElevated: 1,
        pattern: 'structural only',
        bootstrap: true,
      } as ConcernAssessment,
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('bootstrap mode');
  });

  it('shows no structural data when structuralScore is null', () => {
    const data = makeLayerData({ structuralScore: null, structuralDetail: null });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('No structural data available.');
  });

  it('shows no AI data when aiScore is null', () => {
    const data = makeLayerData({ aiScore: null, aiDetail: null });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('No AI assessment data available.');
  });

  it('shows no thematic data when thematicScore is null', () => {
    const data = makeLayerData({ thematicScore: null, thematicDetail: null });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('No thematic drift data available.');
  });

  it('shows functional shifts when present', () => {
    const data = makeLayerData({
      structuralDetail: {
        ...makeLayerData().structuralDetail!,
        functionalShifts: [
          {
            bucket: 'rulemaking',
            baselineRate: 0.3,
            currentRate: 0.5,
            direction: 'increased',
          },
        ],
      },
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('Notable document type shifts');
    expect(prompt).toContain('rulemaking');
    expect(prompt).toContain('increased');
  });

  it('includes status explanation with structural elevated (descriptive only)', () => {
    const data = makeLayerData({
      convergenceDetail: {
        status: 'Stable',
        structuralElevated: true,
        aiElevated: false,
        silenceElevated: false,
        thematicElevated: false,
        layersElevated: 0,
        pattern: 'structural only (descriptive)',
        bootstrap: false,
      },
      totalDocumentCount: 42,
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('L1 structural context');
    expect(prompt).toContain('42 documents');
    expect(prompt).toContain('descriptive only');
  });

  it('includes status explanation with AI elevated', () => {
    const data = makeLayerData({
      convergenceDetail: {
        status: 'Elevated',
        structuralElevated: false,
        aiElevated: true,
        silenceElevated: false,
        thematicElevated: false,
        layersElevated: 1,
        pattern: 'ai only',
        bootstrap: false,
      },
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('L2 AI content assessment elevated');
    expect(prompt).toContain('concern rate');
    expect(prompt).toContain('baseline:');
  });

  it('includes status explanation with thematic elevated (descriptive only)', () => {
    const data = makeLayerData({
      convergenceDetail: {
        status: 'Stable',
        structuralElevated: false,
        aiElevated: false,
        silenceElevated: false,
        thematicElevated: true,
        layersElevated: 0,
        pattern: 'thematic only (descriptive)',
        bootstrap: false,
      },
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('L3 thematic drift context');
    expect(prompt).toContain('descriptive only');
  });

  it('shows pattern-only status when no layers elevated in convergence', () => {
    const data = makeLayerData({
      convergenceDetail: {
        status: 'Stable',
        structuralElevated: false,
        aiElevated: false,
        thematicElevated: false,
        layersElevated: 0,
        pattern: 'none',
        bootstrap: false,
      } as ConcernAssessment,
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('Stable: none.');
  });

  it('shows no-documents message when documentContext is empty', () => {
    const data = makeLayerData({ documentContext: [] });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('No P2-confirmed documents available.');
  });

  it('handles document without optional fields', () => {
    const data = makeLayerData({
      documentContext: [
        {
          title: 'Minimal doc',
          sourceType: 'rss',
          sourceOrigin: null,
          agency: null,
          publishedAt: null,
          url: '',
          assessment: 'routine',
          erosionType: null,
          reasoning: null,
          content: null,
        },
      ],
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('Minimal doc');
    expect(prompt).toContain('Source: rss');
    // Condensed format: no separate Agency/Published lines, no Erosion in assess line
    expect(prompt).not.toContain('| Agency:');
    expect(prompt).not.toContain('| Published:');
    expect(prompt).not.toContain('| Erosion type:');
    expect(prompt).not.toContain('>>> WHY THIS WAS FLAGGED:');
    expect(prompt).not.toContain('Content excerpt:');
  });

  it('includes flagged routine documents when present', () => {
    const data = makeLayerData({
      flaggedRoutineContext: [
        { title: 'Routine doc', sourceType: 'federal_register', publishedAt: '2026-02-19' },
      ],
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('REVIEWED BUT NOT CONFIRMED');
    expect(prompt).toContain('Routine doc');
    expect(prompt).toContain('(2026-02-19)');
  });

  it('excludes flagged routine section when empty', () => {
    const data = makeLayerData({ flaggedRoutineContext: [] });
    const prompt = buildDraftPrompt(data);
    expect(prompt).not.toContain('REVIEWED BUT NOT CONFIRMED');
  });

  it('excludes flagged routine section when undefined', () => {
    const data = makeLayerData();
    // default has no flaggedRoutineContext
    const prompt = buildDraftPrompt(data);
    expect(prompt).not.toContain('REVIEWED BUT NOT CONFIRMED');
  });

  it('includes flagged routine document without publishedAt', () => {
    const data = makeLayerData({
      flaggedRoutineContext: [{ title: 'No date doc', sourceType: 'rss', publishedAt: null }],
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('No date doc [rss]');
    expect(prompt).not.toContain('(null)');
  });

  it('shows unknown for totalDocumentCount when missing', () => {
    const data = makeLayerData();
    // default has no totalDocumentCount
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('Total documents: unknown');
  });

  it('shows totalDocumentCount when provided', () => {
    const data = makeLayerData({ totalDocumentCount: 50 });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('Total documents: 50');
  });

  it('includes source type breakdown when present', () => {
    const data = makeLayerData({
      sourceTypeBreakdown: [
        { sourceType: 'federal_register', count: 20 },
        { sourceType: 'rss', count: 5 },
      ],
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('Source-type breakdown:');
    expect(prompt).toContain('federal_register: 20');
    expect(prompt).toContain('rss: 5');
  });

  it('excludes source type breakdown when empty', () => {
    const data = makeLayerData({ sourceTypeBreakdown: [] });
    const prompt = buildDraftPrompt(data);
    expect(prompt).not.toContain('Source-type breakdown:');
  });

  it('shows baseline unavailable when baselineContext is missing', () => {
    const data = makeLayerData();
    // default has no baselineContext
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('Baseline context unavailable.');
  });

  it('excludes trajectory section when not provided', () => {
    const data = makeLayerData();
    // default has no trajectory
    const prompt = buildDraftPrompt(data);
    expect(prompt).not.toContain('--- TRAJECTORY ---');
  });

  it('shows trajectory without previous week status', () => {
    const data = makeLayerData({
      trajectory: { previousWeekStatus: null, consecutiveWeeksAtStatus: 3 },
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('TRAJECTORY');
    expect(prompt).toContain('Consecutive weeks at current level: 3');
    expect(prompt).not.toContain('Previous week:');
  });

  it('handles thematic detail with bootstrap mode', () => {
    const data = makeLayerData({
      thematicDetail: {
        ...makeLayerData().thematicDetail!,
        bootstrap: true,
      },
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('Bootstrap mode');
  });

  it('shows novel document rate when thematic data is not in bootstrap', () => {
    const data = makeLayerData();
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('Novel document rate');
  });

  it('handles structuralScore non-null but structuralDetail null', () => {
    const data = makeLayerData({ structuralDetail: null });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('No structural data available.');
  });

  it('handles aiScore non-null but aiDetail null', () => {
    const data = makeLayerData({ aiDetail: null });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('No AI assessment data available.');
  });

  it('handles thematicScore non-null but thematicDetail null', () => {
    const data = makeLayerData({ thematicDetail: null });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('No thematic drift data available.');
  });

  it('handles dimension with available=false', () => {
    const data = makeLayerData({
      structuralDetail: {
        ...makeLayerData().structuralDetail!,
        dimensions: {
          volume: { value: 0, baselineMean: 0, baselineStdDev: 0, zScore: 0, available: false },
          typeComposition: {
            value: 0.5,
            baselineMean: 0.3,
            baselineStdDev: 0.1,
            zScore: 2.0,
            available: true,
          },
          functionalDistribution: {
            value: 0,
            baselineMean: 0,
            baselineStdDev: 0,
            zScore: 0,
            available: false,
          },
          agencyActivity: {
            value: 0,
            baselineMean: 0,
            baselineStdDev: 0,
            zScore: 0,
            available: false,
          },
          publicationTempo: {
            value: 0,
            baselineMean: 0,
            baselineStdDev: 0,
            zScore: 0,
            available: false,
          },
        },
      },
    });
    const prompt = buildDraftPrompt(data);
    // L1 block should show document count (descriptive context)
    expect(prompt).toContain('Documents this week');
    // No z-scores should appear
    expect(prompt).not.toMatch(/z-score/);
  });

  it('uses default 0 for totalDocumentCount in statusExplanation when missing', () => {
    const data = makeLayerData({
      convergenceDetail: {
        status: 'Elevated',
        structuralElevated: true,
        aiElevated: false,
        thematicElevated: false,
        layersElevated: 1,
        pattern: 'structural only',
        bootstrap: false,
      } as ConcernAssessment,
      // no totalDocumentCount
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('0 documents');
  });

  it('shows document with sourceOrigin in parentheses', () => {
    const data = makeLayerData({
      documentContext: [
        {
          title: 'FR Doc',
          sourceType: 'federal_register',
          sourceOrigin: 'FR',
          agency: null,
          publishedAt: null,
          url: '',
          assessment: 'routine',
          erosionType: null,
          reasoning: null,
          content: null,
        },
      ],
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('Source: federal_register (FR)');
  });

  it('shows document without sourceOrigin (no parentheses)', () => {
    const data = makeLayerData({
      documentContext: [
        {
          title: 'No origin doc',
          sourceType: 'rss',
          sourceOrigin: null,
          agency: null,
          publishedAt: null,
          url: '',
          assessment: 'routine',
          erosionType: null,
          reasoning: null,
          content: null,
        },
      ],
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('Source: rss');
    expect(prompt).not.toContain('Source: rss (');
  });

  it('includes url when present on document', () => {
    const data = makeLayerData({
      documentContext: [
        {
          title: 'URL doc',
          sourceType: 'rss',
          sourceOrigin: null,
          agency: null,
          publishedAt: null,
          url: 'https://example.com/doc',
          assessment: 'routine',
          erosionType: null,
          reasoning: null,
          content: null,
        },
      ],
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('URL: https://example.com/doc');
  });
});

describe('buildWeeklySummaryPrompt — missing branch coverage', () => {
  function makeWeeklyInput(overrides: Partial<WeeklySummaryInput> = {}): WeeklySummaryInput {
    return {
      weekOf: '2026-02-17',
      categories: [
        makeLayerData(),
        makeLayerData({
          category: 'fiscal',
          categoryTitle: 'Spending Oversight',
          convergenceDetail: {
            status: 'Stable',
            structuralElevated: false,
            aiElevated: false,
            thematicElevated: false,
            layersElevated: 0,
            pattern: 'none',
            bootstrap: false,
          } as ConcernAssessment,
        }),
      ],
      categoryNarratives: new Map([
        ['civilService', { expert: 'Expert narrative', public: 'Public narrative' }],
      ]),
      failedCategories: [],
      previousWeekSummary: null,
      ...overrides,
    };
  }

  it('uses public header for public version', () => {
    const prompt = buildWeeklySummaryPrompt(makeWeeklyInput(), 'public');
    expect(prompt).toContain('plain-language cross-category synthesis');
    expect(prompt).toContain('Avoid technical jargon');
    expect(prompt).toContain('200-350 words');
  });

  it('uses expert header for expert version', () => {
    const prompt = buildWeeklySummaryPrompt(makeWeeklyInput(), 'expert');
    expect(prompt).toContain('technical cross-category synthesis');
    expect(prompt).toContain('Reference specific layer patterns');
    expect(prompt).toContain('300-500 words');
  });

  it('uses public narrative in elevated category section for public version', () => {
    const prompt = buildWeeklySummaryPrompt(makeWeeklyInput(), 'public');
    expect(prompt).toContain('Public narrative');
    expect(prompt).not.toContain('Expert narrative');
  });

  it('shows no prior week available when previousWeekSummary is null', () => {
    const prompt = buildWeeklySummaryPrompt(makeWeeklyInput(), 'expert');
    expect(prompt).toContain('no prior week available');
  });

  it('shows delta count when previousWeekSummary is present', () => {
    const input = makeWeeklyInput({
      previousWeekSummary: { expert: 'Prior expert.', public: 'Prior public.' },
    });
    const prompt = buildWeeklySummaryPrompt(input, 'expert');
    expect(prompt).toContain('1 elevated (see previous week summary for comparison)');
  });

  it('handles all categories stable (no elevated section)', () => {
    const input = makeWeeklyInput({
      categories: [
        makeLayerData({
          convergenceDetail: {
            status: 'Stable',
            structuralElevated: false,
            aiElevated: false,
            thematicElevated: false,
            layersElevated: 0,
            pattern: 'none',
            bootstrap: false,
          } as ConcernAssessment,
        }),
      ],
    });
    const prompt = buildWeeklySummaryPrompt(input, 'expert');
    expect(prompt).not.toContain('ELEVATED+ CATEGORIES');
    expect(prompt).toContain('STABLE CATEGORIES');
  });

  it('handles all categories elevated (no stable section)', () => {
    const input = makeWeeklyInput({
      categories: [
        makeLayerData({
          convergenceDetail: {
            status: 'Elevated',
            structuralElevated: true,
            aiElevated: false,
            thematicElevated: false,
            layersElevated: 1,
            pattern: 'structural only',
            bootstrap: false,
          } as ConcernAssessment,
        }),
      ],
    });
    const prompt = buildWeeklySummaryPrompt(input, 'expert');
    expect(prompt).toContain('ELEVATED+ CATEGORIES');
    expect(prompt).not.toContain('STABLE CATEGORIES');
  });

  it('handles category without convergenceDetail as stable', () => {
    const input = makeWeeklyInput({
      categories: [makeLayerData({ convergenceDetail: null })],
    });
    const prompt = buildWeeklySummaryPrompt(input, 'expert');
    expect(prompt).toContain('STABLE CATEGORIES');
    expect(prompt).not.toContain('ELEVATED+ CATEGORIES');
  });

  it('handles elevated category without a narrative', () => {
    const input = makeWeeklyInput({
      categoryNarratives: new Map(), // no narratives at all
    });
    const prompt = buildWeeklySummaryPrompt(input, 'expert');
    expect(prompt).toContain('ELEVATED+ CATEGORIES');
    // Should still show the category but without a Narrative line
    expect(prompt).not.toContain('Narrative:');
  });

  it('handles elevated category with null convergenceDetail status via ?? fallback', () => {
    const input = makeWeeklyInput({
      categories: [
        makeLayerData({
          convergenceDetail: {
            status: 'Divergent',
            structuralElevated: true,
            aiElevated: true,
            thematicElevated: false,
            layersElevated: 2,
            pattern: 'dual convergence',
            bootstrap: false,
          } as ConcernAssessment,
        }),
      ],
      categoryNarratives: new Map(),
    });
    const prompt = buildWeeklySummaryPrompt(input, 'expert');
    expect(prompt).toContain('Divergent, 2 layers elevated');
  });

  it('handles stable category without totalDocumentCount', () => {
    const input = makeWeeklyInput({
      categories: [
        makeLayerData({
          convergenceDetail: {
            status: 'Stable',
            structuralElevated: false,
            aiElevated: false,
            thematicElevated: false,
            layersElevated: 0,
            pattern: 'none',
            bootstrap: false,
          } as ConcernAssessment,
          // no totalDocumentCount
        }),
      ],
    });
    const prompt = buildWeeklySummaryPrompt(input, 'expert');
    expect(prompt).toContain('0 documents');
  });

  it('handles no failed categories (no section)', () => {
    const input = makeWeeklyInput({ failedCategories: [] });
    const prompt = buildWeeklySummaryPrompt(input, 'expert');
    expect(prompt).not.toContain('FAILED NARRATIVE GENERATION');
  });
});

// ---------------------------------------------------------------------------
// Sprint R-NAR2: evidence-proportional length, source health, thematic context
// ---------------------------------------------------------------------------

describe('buildDraftPrompt — evidence-proportional length', () => {
  it('uses longer word ranges when P2-confirmed docs are present', () => {
    const data = makeLayerData({
      documentContext: [
        {
          title: 'Confirmed doc',
          sourceType: 'federal_register',
          sourceOrigin: 'FR',
          agency: null,
          publishedAt: null,
          url: '',
          assessment: 'clearly_concerning',
          erosionType: null,
          reasoning: null,
          content: null,
        },
      ],
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('400-800 words');
    expect(prompt).toContain('200-500 words');
    expect(prompt).not.toContain('No P2-confirmed documents or L2 AI analysis');
  });

  it('uses shorter word ranges when no P2-confirmed docs and no L2 data', () => {
    const data = makeLayerData({
      documentContext: [],
      aiScore: null,
      aiDetail: null,
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('200-400 words');
    expect(prompt).toContain('150-300 words');
    expect(prompt).toContain('No P2-confirmed documents or L2 AI analysis');
  });

  it('uses longer ranges when L2 data present even without P2-confirmed docs', () => {
    const data = makeLayerData({ documentContext: [] });
    // L2 data still present from default fixture
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('400-800 words');
  });
});

describe('buildDraftPrompt — weighted counter-arguments', () => {
  it('includes counter-argument instruction with limits in preamble', () => {
    const prompt = buildDraftPrompt(makeLayerData());
    expect(prompt).toContain('Rank alternative');
    expect(prompt).toContain('2-3 alternative explanations');
    expect(prompt).toContain('3-4 in the EXPERT');
  });
});

describe('buildDraftPrompt — "why this might matter"', () => {
  it('includes "why this might matter" instruction in public output format', () => {
    const prompt = buildDraftPrompt(makeLayerData());
    expect(prompt).toContain('why this might matter');
    expect(prompt).toContain('conditional language');
  });
});

describe('buildDraftPrompt — small sample caveat', () => {
  it('includes small-sample caveat when totalDocumentCount is below threshold', () => {
    const data = makeLayerData({ totalDocumentCount: 10 });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('SMALL SAMPLE SIZE');
  });

  it('omits small-sample caveat when totalDocumentCount is above threshold', () => {
    const data = makeLayerData({ totalDocumentCount: 50 });
    const prompt = buildDraftPrompt(data);
    expect(prompt).not.toContain('SMALL SAMPLE SIZE');
  });
});

describe('buildDraftPrompt — L2-empty transparency', () => {
  it('includes AI-absent transparency when L2 data is missing', () => {
    const data = makeLayerData({ aiScore: null, aiDetail: null });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('No AI content analysis was performed this week');
    expect(prompt).toContain('structural pattern detection only');
  });
});

describe('buildDraftPrompt — source health warnings', () => {
  it('includes failed source health warning', () => {
    const data = makeLayerData({
      sourceHealthContext: [
        { sourceOrigin: 'FR', status: 'failed', itemsFetched: 0, errors: ['timeout'] },
      ],
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('SOURCE HEALTH WARNINGS');
    expect(prompt).toContain('FR: FAILED');
    expect(prompt).toContain('timeout');
  });

  it('includes partial source health warning', () => {
    const data = makeLayerData({
      sourceHealthContext: [
        { sourceOrigin: 'GovInfo', status: 'partial', itemsFetched: 5, errors: ['rate limited'] },
      ],
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('GovInfo: PARTIAL (5 items');
    expect(prompt).toContain('rate limited');
  });

  it('omits source health section when all sources are OK', () => {
    const data = makeLayerData({
      sourceHealthContext: [
        { sourceOrigin: 'FR', status: 'success', itemsFetched: 20, errors: null },
      ],
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).not.toContain('SOURCE HEALTH WARNINGS');
  });

  it('omits source health section when no health data', () => {
    const data = makeLayerData();
    const prompt = buildDraftPrompt(data);
    expect(prompt).not.toContain('SOURCE HEALTH WARNINGS');
  });
});

describe('buildDraftPrompt — thematic drift context', () => {
  it('includes typical and drift-driving documents', () => {
    const data = makeLayerData({
      typicalDocuments: [{ title: 'Regular doc', sourceType: 'rss', publishedAt: '2026-02-10' }],
      driftDrivingDocuments: [
        { title: 'Unusual doc', sourceType: 'federal_register', publishedAt: '2026-02-18' },
      ],
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('THEMATIC DRIFT CONTEXT');
    expect(prompt).toContain('Typical documents from the prior 8 weeks');
    expect(prompt).toContain('Regular doc');
    expect(prompt).toContain('most divergent from recent norms');
    expect(prompt).toContain('Unusual doc');
  });

  it('omits thematic context when no drift documents', () => {
    const data = makeLayerData();
    const prompt = buildDraftPrompt(data);
    expect(prompt).not.toContain('THEMATIC DRIFT CONTEXT');
  });
});

describe('buildFeedbackPrompt — evidence sufficiency criterion', () => {
  it('includes evidence sufficiency criterion (f)', () => {
    const prompt = buildFeedbackPrompt('Expert', 'Public', makeLayerData());
    expect(prompt).toContain('EVIDENCE SUFFICIENCY');
    expect(prompt).toContain('proportional to the available evidence');
  });
});

describe('buildRevisionPrompt — evidence sufficiency handling', () => {
  it('includes instruction to trim for evidence insufficiency', () => {
    const prompt = buildRevisionPrompt('E', 'P', 'F', makeLayerData());
    expect(prompt).toContain('evidence insufficiency');
    expect(prompt).toContain('trim the narrative');
  });
});

// ---------------------------------------------------------------------------
// Weekly & term summary prompt improvements
// ---------------------------------------------------------------------------

describe('buildWeeklySummaryPrompt — synthesis and coverage instructions', () => {
  function makeWeeklyInput(overrides: Partial<WeeklySummaryInput> = {}): WeeklySummaryInput {
    return {
      weekOf: '2026-02-17',
      categories: [
        makeLayerData(),
        makeLayerData({
          category: 'fiscal',
          categoryTitle: 'Spending Oversight',
          convergenceDetail: {
            status: 'Stable',
            structuralElevated: false,
            aiElevated: false,
            thematicElevated: false,
            layersElevated: 0,
            pattern: 'none',
            bootstrap: false,
          } as ConcernAssessment,
        }),
      ],
      categoryNarratives: new Map(),
      failedCategories: [],
      previousWeekSummary: null,
      ...overrides,
    };
  }

  it('includes synthesize-not-recapitulate instruction', () => {
    const prompt = buildWeeklySummaryPrompt(makeWeeklyInput(), 'expert');
    expect(prompt).toContain('SYNTHESIZE, do not recapitulate');
  });

  it('includes "why this might matter" instruction', () => {
    const prompt = buildWeeklySummaryPrompt(makeWeeklyInput(), 'public');
    expect(prompt).toContain('why this might matter');
    expect(prompt).toContain('conditional');
  });

  it('flags zero-document stable categories', () => {
    const input = makeWeeklyInput({
      categories: [
        makeLayerData(),
        makeLayerData({
          category: 'fiscal',
          categoryTitle: 'Spending Oversight',
          totalDocumentCount: 0,
          convergenceDetail: {
            status: 'Stable',
            structuralElevated: false,
            aiElevated: false,
            thematicElevated: false,
            layersElevated: 0,
            pattern: 'none',
            bootstrap: false,
          } as ConcernAssessment,
        }),
      ],
    });
    const prompt = buildWeeklySummaryPrompt(input, 'expert');
    expect(prompt).toContain('DATA AVAILABILITY NOTE');
    expect(prompt).toContain('1 of 1 stable categories had zero documents');
  });

  it('omits data availability note when all stable categories have documents', () => {
    const input = makeWeeklyInput({
      categories: [
        makeLayerData({
          category: 'fiscal',
          categoryTitle: 'Spending Oversight',
          totalDocumentCount: 25,
          convergenceDetail: {
            status: 'Stable',
            structuralElevated: false,
            aiElevated: false,
            thematicElevated: false,
            layersElevated: 0,
            pattern: 'none',
            bootstrap: false,
          } as ConcernAssessment,
        }),
      ],
    });
    const prompt = buildWeeklySummaryPrompt(input, 'expert');
    expect(prompt).not.toContain('DATA AVAILABILITY NOTE');
  });
});

describe('buildTermSummaryPrompt — critical evaluation and compression', () => {
  function makeTermInput(overrides: Partial<TermSummaryInput> = {}): TermSummaryInput {
    return {
      weekOf: '2026-02-17',
      weeklySummary: { expert: 'This week expert.', public: 'This week public.' },
      significantWeeks: [],
      trajectoryTable: [],
      statistics: {
        weeksPerStatus: [],
        peakConvergenceWeek: null,
        currentTrend: [],
      },
      ...overrides,
    };
  }

  it('includes standalone-synthesis instruction', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).toContain('standalone synthesis');
    expect(prompt).toContain('no prior term summary to update');
  });

  it('instructs date-only references to significant weeks', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).toContain('Reference them by date');
    expect(prompt).toContain('Do NOT invent URLs');
  });

  it('includes term-level layer pattern instruction', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).toContain('TERM-LEVEL layer patterns');
    expect(prompt).toContain('not this week');
  });

  it('includes pre-computed trajectory instruction', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).toContain('pre-computed');
    expect(prompt).toContain('do not reconstruct per-week data sequences');
  });

  it('includes "why this might matter" instruction', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'public');
    expect(prompt).toContain('why this might matter');
    expect(prompt).toContain('cumulative trajectory');
  });

  it('includes link preservation instruction', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).toContain('preserve its markdown link');
  });
});

// ---------------------------------------------------------------------------
// Sprint R-NAR: trajectory summary, P2 prominence, document links
// ---------------------------------------------------------------------------

describe('formatTrajectorySummary', () => {
  it('returns empty message for empty input', () => {
    const result = formatTrajectorySummary([]);
    expect(result).toContain('TRAJECTORY SUMMARY');
    expect(result).toContain('No trajectory data available.');
  });

  it('computes peak, mean, and activation rates for single category', () => {
    const table = [
      { category: 'civilService', weekOf: '2026-01-06', status: 'Stable' },
      { category: 'civilService', weekOf: '2026-01-13', status: 'Elevated' },
      { category: 'civilService', weekOf: '2026-01-20', status: 'Elevated' },
      { category: 'civilService', weekOf: '2026-01-27', status: 'Stable' },
    ];
    const result = formatTrajectorySummary(table);
    expect(result).toContain('TRAJECTORY SUMMARY');
    expect(result).toContain('Term span: 2026-01-06 to 2026-01-27 (4 weeks)');
    expect(result).toContain('Peak: 1');
    expect(result).toContain('civilService: 2/4 weeks (50.0%)');
  });

  it('computes multi-category statistics correctly', () => {
    const table = [
      { category: 'civilService', weekOf: '2026-01-06', status: 'Elevated' },
      { category: 'civilService', weekOf: '2026-01-13', status: 'Elevated' },
      { category: 'civilService', weekOf: '2026-01-20', status: 'Stable' },
      { category: 'elections', weekOf: '2026-01-06', status: 'Stable' },
      { category: 'elections', weekOf: '2026-01-13', status: 'Elevated' },
      { category: 'elections', weekOf: '2026-01-20', status: 'Elevated' },
    ];
    const result = formatTrajectorySummary(table);
    // Peak: 2 categories elevated on 2026-01-13
    expect(result).toContain('Peak: 2');
    // Both categories at 2/3 weeks
    expect(result).toContain('(66.7%)');
    // Consecutive streak: both have 2-week streaks
    expect(result).toContain('Longest consecutive elevated streaks');
  });

  it('detects status transitions', () => {
    const table = [
      { category: 'civilService', weekOf: '2026-01-06', status: 'Stable' },
      { category: 'civilService', weekOf: '2026-01-13', status: 'Elevated' },
    ];
    const result = formatTrajectorySummary(table);
    expect(result).toContain('Recent transitions');
    expect(result).toContain('Stable → Elevated');
  });

  it('omits streaks section when no streaks longer than 1 week', () => {
    const table = [
      { category: 'civilService', weekOf: '2026-01-06', status: 'Elevated' },
      { category: 'civilService', weekOf: '2026-01-13', status: 'Stable' },
      { category: 'civilService', weekOf: '2026-01-20', status: 'Elevated' },
    ];
    const result = formatTrajectorySummary(table);
    expect(result).not.toContain('Longest consecutive elevated streaks');
  });

  it('handles ConfirmedConcern and Divergent as elevated', () => {
    const table = [
      { category: 'civilService', weekOf: '2026-01-06', status: 'ConfirmedConcern' },
      { category: 'civilService', weekOf: '2026-01-13', status: 'Divergent' },
    ];
    const result = formatTrajectorySummary(table);
    expect(result).toContain('2/2 weeks (100.0%)');
  });
});

describe('formatDocumentSection — P2 reasoning prominence', () => {
  it('includes WHY THIS WAS FLAGGED when reasoning is present', () => {
    const data = makeLayerData({
      documentContext: [
        {
          title: 'Test Doc',
          sourceType: 'federal_register',
          sourceOrigin: 'FR',
          agency: 'DOJ',
          publishedAt: '2026-02-18',
          url: 'https://example.com/doc',
          assessment: 'clearly_concerning',
          erosionType: 'formal_override',
          reasoning: 'This order removes protections for civil servants.',
          content: 'Full text here.',
        },
      ],
    });
    const result = formatDocumentSection(data);
    expect(result).toContain('>>> WHY THIS WAS FLAGGED: This order removes protections');
    expect(result).toContain('Source: federal_register (FR) | Published: 2026-02-18 | Agency: DOJ');
    expect(result).toContain('Assessment: clearly_concerning | Erosion type: formal_override');
  });

  it('omits WHY THIS WAS FLAGGED when reasoning is null', () => {
    const data = makeLayerData({
      documentContext: [
        {
          title: 'No reasoning doc',
          sourceType: 'rss',
          sourceOrigin: null,
          agency: null,
          publishedAt: null,
          url: '',
          assessment: 'routine',
          erosionType: null,
          reasoning: null,
          content: null,
        },
      ],
    });
    const result = formatDocumentSection(data);
    expect(result).not.toContain('WHY THIS WAS FLAGGED');
  });
});

describe('buildDraftPrompt — P2 grounding and link instructions', () => {
  it('contains P2 grounding instruction', () => {
    const prompt = buildDraftPrompt(makeLayerData());
    expect(prompt).toContain('WHY THIS WAS FLAGGED');
    expect(prompt).toContain('event-level descriptions');
  });

  it('contains markdown link instruction', () => {
    const prompt = buildDraftPrompt(makeLayerData());
    expect(prompt).toContain('markdown links');
    expect(prompt).toContain('[document title](URL)');
  });
});

describe('buildWeeklySummaryPrompt — link preservation', () => {
  function makeWeeklyInput(overrides: Partial<WeeklySummaryInput> = {}): WeeklySummaryInput {
    return {
      weekOf: '2026-02-17',
      categories: [makeLayerData()],
      categoryNarratives: new Map(),
      failedCategories: [],
      previousWeekSummary: null,
      ...overrides,
    };
  }

  it('contains link preservation instruction', () => {
    const prompt = buildWeeklySummaryPrompt(makeWeeklyInput(), 'expert');
    expect(prompt).toContain('preserve its markdown link');
  });
});
