import { describe, it, expect } from 'vitest';
import {
  buildDraftPrompt,
  buildFeedbackPrompt,
  buildRevisionPrompt,
  buildWeeklySummaryPrompt,
  buildTermSummaryPrompt,
} from '@/lib/services/narrative-prompts';
import type { WeeklySummaryInput, TermSummaryInput } from '@/lib/types';
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
});
