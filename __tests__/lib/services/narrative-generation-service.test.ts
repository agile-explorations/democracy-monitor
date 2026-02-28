import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getProvider } from '@/lib/ai/provider';
import {
  isElevatedStatus,
  buildStableTemplate,
  buildExpertPrompt,
  buildPublicPrompt,
  buildOverviewPrompt,
  formatLayerContext,
  generateCategoryNarrative,
  generateOverviewNarrative,
} from '@/lib/services/narrative-generation-service';
import type { NarrativeLayerData, OverviewNarrativeInput } from '@/lib/types';
import type {
  ConvergenceSynthesis,
  StructuralScore,
  ThematicDriftScore,
} from '@/lib/types/structural';

// Mock the AI provider module
vi.mock('@/lib/ai/provider', () => ({
  getProvider: vi.fn(),
}));

function makeConvergence(
  status: ConvergenceSynthesis['status'],
  layersElevated = 0,
): ConvergenceSynthesis {
  return {
    status,
    structuralElevated: layersElevated > 0,
    aiElevated: layersElevated > 1,
    thematicElevated: layersElevated > 2,
    layersElevated,
    pattern: 'test pattern',
    bootstrap: false,
  };
}

function makeStructuralScore(): StructuralScore {
  const dim = { value: 0.5, baselineMean: 0.3, baselineStdDev: 0.1, zScore: 2.0, available: true };
  return {
    composite: 0.75,
    dimensions: {
      volume: dim,
      typeComposition: dim,
      functionalDistribution: dim,
      agencyActivity: dim,
      publicationTempo: dim,
    },
    anomalous: true,
    functionalShifts: [
      { bucket: 'personnel_action', baselineRate: 0.05, currentRate: 0.15, direction: 'increased' },
    ],
    longHorizon: { cumulativeDeviation: 3.0, cumulativeWindow: 16, driftTrend: 'increasing' },
  };
}

function makeThematicScore(): ThematicDriftScore {
  return {
    rollingCentroidDistance: 0.12,
    rollingWindow: { weeks: 8, meanDistance: 0.06, stdDev: 0.02 },
    zScore: 3.0,
    novelDocumentRate: 0.08,
    varianceRatio: 1.5,
    crossAdminDistance: null,
    crossAdminBaseline: null,
    bootstrap: false,
  };
}

function makeLayerData(overrides: Partial<NarrativeLayerData> = {}): NarrativeLayerData {
  return {
    category: 'civilService',
    categoryTitle: 'Government Worker Protections',
    weekOf: '2026-02-17',
    structuralScore: 0.75,
    structuralDetail: makeStructuralScore(),
    aiScore: 0.8,
    aiDetail: {
      flagCount: 10,
      totalDocuments: 100,
      flagRate: 0.1,
      baselineFlagRate: 0.02,
      flagRateZScore: 2.5,
      concernDistribution: {
        routine: 5,
        novelNotConcerning: 2,
        potentiallyConcerning: 2,
        clearlyConcerning: 1,
      },
      concernRate: 0.3,
      auditSample: { sampled: 3, falseNegatives: 0, falseNegativeRate: 0 },
      pass1Model: 'gpt-4o-mini',
      pass2Model: 'claude-sonnet-4-5-20250929',
    },
    thematicScore: 0.65,
    thematicDetail: makeThematicScore(),
    convergenceScore: 0.8,
    convergenceDetail: makeConvergence('Elevated', 1),
    ...overrides,
  };
}

describe('isElevatedStatus', () => {
  it('returns false for null convergence detail', () => {
    expect(isElevatedStatus(null)).toBe(false);
  });

  it('returns false for Stable status', () => {
    expect(isElevatedStatus(makeConvergence('Stable'))).toBe(false);
  });

  it('returns true for Elevated status', () => {
    expect(isElevatedStatus(makeConvergence('Elevated', 1))).toBe(true);
  });

  it('returns true for Divergent status', () => {
    expect(isElevatedStatus(makeConvergence('Divergent', 2))).toBe(true);
  });

  it('returns true for ConfirmedConcern status', () => {
    expect(isElevatedStatus(makeConvergence('ConfirmedConcern', 2))).toBe(true);
  });
});

describe('buildStableTemplate', () => {
  it('returns a template with category title and date', () => {
    const result = buildStableTemplate('Government Worker Protections', '2026-02-17');
    expect(result.expert).toContain('Government Worker Protections');
    expect(result.expert).toContain('2026-02-17');
    expect(result.expert).toContain('No significant structural');
    expect(result.model).toBe('template');
  });

  it('returns identical expert and public content', () => {
    const result = buildStableTemplate('Test Category', '2026-01-01');
    expect(result.expert).toBe(result.public);
  });
});

describe('buildExpertPrompt', () => {
  it('includes category name and week', () => {
    const prompt = buildExpertPrompt(makeLayerData());
    expect(prompt).toContain('Government Worker Protections');
    expect(prompt).toContain('2026-02-17');
  });

  it('includes structural score data', () => {
    const prompt = buildExpertPrompt(makeLayerData());
    expect(prompt).toContain('Composite score: 0.750');
    expect(prompt).toContain('z-score');
  });

  it('includes AI assessment data', () => {
    const prompt = buildExpertPrompt(makeLayerData());
    expect(prompt).toContain('Flag rate:');
    expect(prompt).toContain('Concern rate:');
  });

  it('includes thematic drift data', () => {
    const prompt = buildExpertPrompt(makeLayerData());
    expect(prompt).toContain('Centroid distance:');
    expect(prompt).toContain('Novel document rate:');
  });

  it('requests limitations sentence', () => {
    const prompt = buildExpertPrompt(makeLayerData());
    expect(prompt).toContain('Limitations');
  });

  it('requests counter-arguments', () => {
    const prompt = buildExpertPrompt(makeLayerData());
    expect(prompt).toContain('counter-arguments');
  });
});

describe('buildPublicPrompt', () => {
  it('includes category name and week', () => {
    const prompt = buildPublicPrompt(makeLayerData());
    expect(prompt).toContain('Government Worker Protections');
    expect(prompt).toContain('2026-02-17');
  });

  it('requests no technical metrics', () => {
    const prompt = buildPublicPrompt(makeLayerData());
    expect(prompt).toContain('Do NOT reference z-scores');
  });

  it('requests plain language', () => {
    const prompt = buildPublicPrompt(makeLayerData());
    expect(prompt).toContain('plain-language');
  });
});

describe('formatLayerContext', () => {
  it('includes all four sections', () => {
    const context = formatLayerContext(makeLayerData());
    expect(context).toContain('CONVERGENCE SYNTHESIS');
    expect(context).toContain('LAYER 1: STRUCTURAL ANOMALY');
    expect(context).toContain('LAYER 2: AI ASSESSMENT');
    expect(context).toContain('LAYER 3: THEMATIC DRIFT');
  });

  it('handles null layer data gracefully', () => {
    const data = makeLayerData({
      structuralScore: null,
      structuralDetail: null,
      aiScore: null,
      aiDetail: null,
      thematicScore: null,
      thematicDetail: null,
      convergenceDetail: null,
    });
    const context = formatLayerContext(data);
    expect(context).toContain('No structural data available');
    expect(context).toContain('No AI assessment data available');
    expect(context).toContain('No thematic drift data available');
    expect(context).toContain('No convergence data available');
  });

  it('includes functional shift details', () => {
    const context = formatLayerContext(makeLayerData());
    expect(context).toContain('personnel_action');
    expect(context).toContain('increased');
  });

  it('notes bootstrap mode for thematic drift', () => {
    const data = makeLayerData({
      thematicDetail: { ...makeThematicScore(), bootstrap: true },
    });
    const context = formatLayerContext(data);
    expect(context).toContain('Bootstrap mode: yes');
  });
});

describe('generateCategoryNarrative', () => {
  const mockProvider = {
    name: 'anthropic',
    isAvailable: vi.fn(),
    complete: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);
  });

  it('returns template for Stable categories without calling AI', async () => {
    const data = makeLayerData({
      convergenceDetail: makeConvergence('Stable'),
    });
    const result = await generateCategoryNarrative(data);
    expect(result.model).toBe('template');
    expect(result.expert).toContain('No significant structural');
  });

  it('returns template when AI provider is unavailable', async () => {
    mockProvider.isAvailable.mockReturnValue(false);
    const data = makeLayerData({
      convergenceDetail: makeConvergence('Elevated', 1),
    });
    const result = await generateCategoryNarrative(data);
    expect(result.model).toBe('template');
  });

  it('calls AI provider for Elevated categories', async () => {
    mockProvider.isAvailable.mockReturnValue(true);
    mockProvider.complete.mockResolvedValue({
      content: 'Expert narrative text',
      model: 'claude-opus-4-6',
      tokensUsed: { input: 100, output: 200 },
      latencyMs: 500,
    });

    const data = makeLayerData({
      convergenceDetail: makeConvergence('Elevated', 1),
    });
    const result = await generateCategoryNarrative(data);

    expect(result.model).toBe('claude-opus-4-6');
    expect(result.expert).toBe('Expert narrative text');
    // Two calls: expert + public
    expect(mockProvider.complete).toHaveBeenCalledTimes(2);
  });

  it('calls AI provider for ConfirmedConcern categories', async () => {
    mockProvider.isAvailable.mockReturnValue(true);
    mockProvider.complete.mockResolvedValue({
      content: 'Narrative',
      model: 'claude-opus-4-6',
      tokensUsed: { input: 100, output: 200 },
      latencyMs: 500,
    });

    const data = makeLayerData({
      convergenceDetail: makeConvergence('ConfirmedConcern', 2),
    });
    await generateCategoryNarrative(data);
    expect(mockProvider.complete).toHaveBeenCalledTimes(2);
  });

  it('passes correct model in options', async () => {
    mockProvider.isAvailable.mockReturnValue(true);
    mockProvider.complete.mockResolvedValue({
      content: 'text',
      model: 'claude-opus-4-6',
      tokensUsed: { input: 100, output: 200 },
      latencyMs: 500,
    });

    const data = makeLayerData({
      convergenceDetail: makeConvergence('Elevated', 1),
    });
    await generateCategoryNarrative(data);

    const calls = mockProvider.complete.mock.calls;
    expect(calls[0][1]).toMatchObject({ model: 'claude-opus-4-6' });
    expect(calls[1][1]).toMatchObject({ model: 'claude-opus-4-6' });
  });
});

describe('buildOverviewPrompt', () => {
  it('includes week and category counts for expert version', () => {
    const input: OverviewNarrativeInput = {
      weekOf: '2026-02-17',
      categories: [
        makeLayerData({ convergenceDetail: makeConvergence('Elevated', 1) }),
        makeLayerData({
          category: 'fiscal',
          categoryTitle: 'Spending Money Congress Approved',
          convergenceDetail: makeConvergence('Stable'),
        }),
      ],
    };
    const prompt = buildOverviewPrompt(input, 'expert');
    expect(prompt).toContain('2026-02-17');
    expect(prompt).toContain('Total categories monitored: 2');
    expect(prompt).toContain('Categories at Elevated or above: 1');
    expect(prompt).toContain('Categories at Stable: 1');
  });

  it('lists elevated categories with their status', () => {
    const input: OverviewNarrativeInput = {
      weekOf: '2026-02-17',
      categories: [makeLayerData({ convergenceDetail: makeConvergence('Divergent', 2) })],
    };
    const prompt = buildOverviewPrompt(input, 'public');
    expect(prompt).toContain('Government Worker Protections');
    expect(prompt).toContain('Divergent');
  });

  it('notes when all categories are stable', () => {
    const input: OverviewNarrativeInput = {
      weekOf: '2026-02-17',
      categories: [makeLayerData({ convergenceDetail: makeConvergence('Stable') })],
    };
    const prompt = buildOverviewPrompt(input, 'expert');
    expect(prompt).toContain('All categories are within baseline parameters');
  });

  it('requests technical detail for expert version', () => {
    const input: OverviewNarrativeInput = {
      weekOf: '2026-02-17',
      categories: [makeLayerData()],
    };
    const prompt = buildOverviewPrompt(input, 'expert');
    expect(prompt).toContain('specific layer patterns');
    expect(prompt).toContain('400-800 words');
  });

  it('requests plain language for public version', () => {
    const input: OverviewNarrativeInput = {
      weekOf: '2026-02-17',
      categories: [makeLayerData()],
    };
    const prompt = buildOverviewPrompt(input, 'public');
    expect(prompt).toContain('plain language');
    expect(prompt).toContain('200-500 words');
  });
});

describe('generateOverviewNarrative', () => {
  const mockProvider = {
    name: 'anthropic',
    isAvailable: vi.fn(),
    complete: vi.fn(),
  };

  beforeEach(() => {
    vi.resetAllMocks();
    (getProvider as ReturnType<typeof vi.fn>).mockReturnValue(mockProvider);
  });

  it('returns template when no categories are elevated', async () => {
    const result = await generateOverviewNarrative({
      weekOf: '2026-02-17',
      categories: [makeLayerData({ convergenceDetail: makeConvergence('Stable') })],
    });
    expect(result.model).toBe('template');
    expect(result.expert).toContain('within baseline parameters');
  });

  it('returns fallback when AI provider unavailable', async () => {
    mockProvider.isAvailable.mockReturnValue(false);
    const result = await generateOverviewNarrative({
      weekOf: '2026-02-17',
      categories: [makeLayerData({ convergenceDetail: makeConvergence('Elevated', 1) })],
    });
    expect(result.model).toBe('template');
    expect(result.expert).toContain('unavailable');
  });

  it('calls AI provider when elevated categories exist', async () => {
    mockProvider.isAvailable.mockReturnValue(true);
    mockProvider.complete.mockResolvedValue({
      content: 'Overview text',
      model: 'claude-opus-4-6',
      tokensUsed: { input: 100, output: 200 },
      latencyMs: 500,
    });

    const result = await generateOverviewNarrative({
      weekOf: '2026-02-17',
      categories: [makeLayerData({ convergenceDetail: makeConvergence('Elevated', 1) })],
    });
    expect(result.expert).toBe('Overview text');
    expect(result.model).toBe('claude-opus-4-6');
    expect(mockProvider.complete).toHaveBeenCalledTimes(2);
  });
});
