import { describe, it, expect } from 'vitest';
import {
  buildDraftPrompt,
  buildFeedbackPrompt,
  buildRevisionPrompt,
  buildWeeklySummaryPrompt,
  buildTermSummaryPrompt,
} from '@/lib/services/narrative-prompts';
import type { WeeklySummaryInput, TermSummaryInput } from '@/lib/types';
import type { ConvergenceSynthesis } from '@/lib/types/structural';
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

  it('includes all 5 review categories', () => {
    const prompt = buildFeedbackPrompt('Expert', 'Public', makeLayerData());
    expect(prompt).toContain('FACTUAL ACCURACY');
    expect(prompt).toContain('CONFIDENCE CALIBRATION');
    expect(prompt).toContain('MISSING COUNTER-ARGUMENTS');
    expect(prompt).toContain('CHARACTERIZATION CONCERNS');
    expect(prompt).toContain('BALANCE');
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

  it('includes revision instructions', () => {
    const prompt = buildRevisionPrompt('E', 'P', 'F', makeLayerData());
    expect(prompt).toContain('REVISION INSTRUCTIONS');
    expect(prompt).toContain('feedback item (a through e)');
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
          } as ConvergenceSynthesis,
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
      previousTermSummary: null,
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

  it('includes trajectory table', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).toContain('TRAJECTORY TABLE');
    expect(prompt).toContain('civilService');
  });

  it('includes statistics', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).toContain('KEY STATISTICS');
    expect(prompt).toContain('Peak convergence week: 2026-02-17');
    expect(prompt).toContain('worsening');
  });

  it('shows first-time notice when no prior summary', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'expert');
    expect(prompt).toContain('first term summary');
  });

  it('includes previous term summary when available', () => {
    const input = makeTermInput({
      previousTermSummary: { expert: 'Prior term expert.', public: 'Prior term public.' },
    });
    const prompt = buildTermSummaryPrompt(input, 'expert');
    expect(prompt).toContain('PREVIOUS TERM SUMMARY');
    expect(prompt).toContain('Prior term expert.');
  });

  it('uses public version of previous summary for public prompt', () => {
    const input = makeTermInput({
      previousTermSummary: { expert: 'Prior term expert.', public: 'Prior term public.' },
    });
    const prompt = buildTermSummaryPrompt(input, 'public');
    expect(prompt).toContain('Prior term public.');
    expect(prompt).not.toContain('Prior term expert.');
  });

  it('uses public weekly summary for public version', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'public');
    expect(prompt).toContain('This week public.');
    expect(prompt).not.toContain('This week expert.');
  });

  it('handles empty trajectory table', () => {
    const input = makeTermInput({ trajectoryTable: [] });
    const prompt = buildTermSummaryPrompt(input, 'expert');
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
    expect(prompt).toContain('800-1500');
    expect(prompt).toContain('technical');
  });

  it('includes word range for public version', () => {
    const prompt = buildTermSummaryPrompt(makeTermInput(), 'public');
    expect(prompt).toContain('500-1000');
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
      } as ConvergenceSynthesis,
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('No layers elevated.');
  });

  it('shows all three layers fired', () => {
    const data = makeLayerData({
      convergenceDetail: {
        status: 'ConfirmedConcern',
        structuralElevated: true,
        aiElevated: true,
        thematicElevated: true,
        layersElevated: 3,
        pattern: 'full convergence',
        bootstrap: false,
      } as ConvergenceSynthesis,
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('L1 (structural)');
    expect(prompt).toContain('L2 (AI)');
    expect(prompt).toContain('L3 (thematic)');
    expect(prompt).toContain('Layers fired:');
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
      } as ConvergenceSynthesis,
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
    expect(prompt).toContain('Functional shifts:');
    expect(prompt).toContain('rulemaking');
    expect(prompt).toContain('30.0%');
    expect(prompt).toContain('50.0%');
    expect(prompt).toContain('increased');
  });

  it('includes status explanation with structural elevated', () => {
    const data = makeLayerData({
      convergenceDetail: {
        status: 'Elevated',
        structuralElevated: true,
        aiElevated: false,
        thematicElevated: false,
        layersElevated: 1,
        pattern: 'structural only',
        bootstrap: false,
      } as ConvergenceSynthesis,
      totalDocumentCount: 42,
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('L1 structural score');
    expect(prompt).toContain('42 documents');
    expect(prompt).toContain('Elevated because');
  });

  it('includes status explanation with AI elevated', () => {
    const data = makeLayerData({
      convergenceDetail: {
        status: 'Elevated',
        structuralElevated: false,
        aiElevated: true,
        thematicElevated: false,
        layersElevated: 1,
        pattern: 'ai only',
        bootstrap: false,
      } as ConvergenceSynthesis,
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('L2 corroborated');
    expect(prompt).toContain('concern rate');
    expect(prompt).toContain('baseline:');
  });

  it('includes status explanation with thematic elevated', () => {
    const data = makeLayerData({
      convergenceDetail: {
        status: 'Elevated',
        structuralElevated: false,
        aiElevated: false,
        thematicElevated: true,
        layersElevated: 1,
        pattern: 'thematic only',
        bootstrap: false,
      } as ConvergenceSynthesis,
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('L3 thematic drift score');
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
      } as ConvergenceSynthesis,
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
    // Should NOT include agency/published/erosion/reasoning/content lines
    expect(prompt).not.toContain('Agency:');
    expect(prompt).not.toContain('Published:');
    expect(prompt).not.toContain('Erosion type:');
    expect(prompt).not.toContain('Reasoning:');
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
    expect(prompt).toContain('Bootstrap mode: yes');
  });

  it('shows thematic direction as reinforcing when thematicElevated is true', () => {
    const data = makeLayerData({
      convergenceDetail: {
        status: 'Elevated',
        structuralElevated: false,
        aiElevated: false,
        thematicElevated: true,
        layersElevated: 1,
        pattern: 'thematic only',
        bootstrap: false,
      } as ConvergenceSynthesis,
    });
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('Direction: reinforcing');
  });

  it('shows thematic direction as not reinforcing when thematicElevated is false', () => {
    const data = makeLayerData();
    // default has thematicElevated: false
    const prompt = buildDraftPrompt(data);
    expect(prompt).toContain('Direction: not reinforcing');
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
    // Only typeComposition should appear with z-score
    expect(prompt).toContain('typeComposition: z-score');
    // volume should not appear as a dimension line (it's unavailable)
    expect(prompt).not.toMatch(/volume: z-score/);
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
      } as ConvergenceSynthesis,
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
          } as ConvergenceSynthesis,
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
    expect(prompt).toContain('200-500 words');
  });

  it('uses expert header for expert version', () => {
    const prompt = buildWeeklySummaryPrompt(makeWeeklyInput(), 'expert');
    expect(prompt).toContain('technical cross-category synthesis');
    expect(prompt).toContain('Reference specific layer patterns');
    expect(prompt).toContain('400-800 words');
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
          } as ConvergenceSynthesis,
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
          } as ConvergenceSynthesis,
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
          } as ConvergenceSynthesis,
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
          } as ConvergenceSynthesis,
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
