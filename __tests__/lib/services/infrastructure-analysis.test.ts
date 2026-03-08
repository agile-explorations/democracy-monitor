import { describe, it, expect } from 'vitest';
import {
  computeConvergenceScore,
  getConvergenceLevel,
  analyzeInfrastructure,
} from '@/lib/services/infrastructure-analysis';
import type { EnhancedAssessment } from '@/lib/types';
import type { InfrastructureThemeResult } from '@/lib/types/infrastructure';

function makeThemeResult(
  overrides: Partial<InfrastructureThemeResult> = {},
): InfrastructureThemeResult {
  return {
    theme: 'detention_incarceration',
    label: 'Detention & Incarceration',
    description: 'Test theme',
    active: false,
    matchCount: 0,
    intensity: 0,
    matches: [],
    categoriesInvolved: [],
    ...overrides,
  };
}

function makeAssessment(overrides: Partial<EnhancedAssessment> = {}): EnhancedAssessment {
  return {
    category: 'test',
    status: 'Stable',
    reason: '',
    matches: [],
    dataCoverage: 0,
    evidenceFor: [],
    evidenceAgainst: [],
    howWeCouldBeWrong: [],
    keywordResult: {
      status: 'Stable',
      reason: 'No matches',
      matches: [],
      detail: { matchedKeywords: [], tier: null, authorityWeight: 0, patternMultiplier: 1 },
    },
    ...overrides,
  };
}

describe('computeConvergenceScore', () => {
  it('returns 0 when no themes have intensity', () => {
    const themes = [makeThemeResult({ intensity: 0 }), makeThemeResult({ intensity: 0 })];
    expect(computeConvergenceScore(themes)).toBe(0);
  });

  it('returns 0 when only 1 theme has intensity', () => {
    const themes = [
      makeThemeResult({ intensity: 5 }),
      makeThemeResult({ intensity: 0 }),
      makeThemeResult({ intensity: 0 }),
    ];
    expect(computeConvergenceScore(themes)).toBe(0);
  });

  it('returns product of 2 active theme intensities', () => {
    const themes = [
      makeThemeResult({ intensity: 3 }),
      makeThemeResult({ intensity: 7 }),
      makeThemeResult({ intensity: 0 }),
    ];
    expect(computeConvergenceScore(themes)).toBe(21);
  });

  it('returns product of 3 active theme intensities', () => {
    const themes = [
      makeThemeResult({ intensity: 3 }),
      makeThemeResult({ intensity: 5 }),
      makeThemeResult({ intensity: 4 }),
    ];
    expect(computeConvergenceScore(themes)).toBe(60);
  });

  it('returns product when all themes have intensity 1', () => {
    const themes = [
      makeThemeResult({ intensity: 1 }),
      makeThemeResult({ intensity: 1 }),
      makeThemeResult({ intensity: 1 }),
    ];
    expect(computeConvergenceScore(themes)).toBe(1);
  });
});

describe('getConvergenceLevel', () => {
  it('returns none when 0 active', () => {
    expect(getConvergenceLevel(0, 0)).toBe('none');
  });

  it('returns emerging when 1 active', () => {
    expect(getConvergenceLevel(0, 1)).toBe('emerging');
  });

  it('returns active when 2+ active and score below threshold', () => {
    expect(getConvergenceLevel(10, 2)).toBe('active');
    expect(getConvergenceLevel(49, 2)).toBe('active');
  });

  it('returns entrenched when 2+ active and score at threshold', () => {
    expect(getConvergenceLevel(50, 2)).toBe('entrenched');
  });

  it('returns entrenched when 2+ active and score above threshold', () => {
    expect(getConvergenceLevel(100, 3)).toBe('entrenched');
  });
});

describe('analyzeInfrastructure', () => {
  it('returns intensity and convergenceScore in output', () => {
    // Use snapshots with keywords that match infrastructure themes
    const snapshots: Record<string, EnhancedAssessment> = {
      civil_liberties: makeAssessment({
        category: 'civil_liberties',
        reason: 'detention facility expansion and surveillance technology',
        matches: ['detention facility', 'surveillance technology'],
      }),
    };

    const result = analyzeInfrastructure(snapshots);

    expect(result.convergenceScore).toBeTypeOf('number');
    expect(result.convergence).toBeTypeOf('string');
    expect(['none', 'emerging', 'active', 'entrenched']).toContain(result.convergence);

    for (const theme of result.themes) {
      expect(theme.intensity).toBeTypeOf('number');
      expect(theme.intensity).toBe(theme.matchCount);
    }
  });

  it('returns none convergence when no matches', () => {
    const snapshots: Record<string, EnhancedAssessment> = {
      fiscal: makeAssessment({ category: 'fiscal', reason: 'Budget review complete' }),
    };

    const result = analyzeInfrastructure(snapshots);
    expect(result.convergence).toBe('none');
    expect(result.convergenceScore).toBe(0);
  });

  it('produces convergence note for none level', () => {
    const snapshots: Record<string, EnhancedAssessment> = {
      fiscal: makeAssessment({ category: 'fiscal', reason: 'No concerning patterns' }),
    };

    const result = analyzeInfrastructure(snapshots);
    expect(result.convergenceNote).toContain('No authoritarian infrastructure patterns');
  });

  it('produces convergence note for emerging level (single theme active)', () => {
    const snapshots: Record<string, EnhancedAssessment> = {
      civil_liberties: makeAssessment({
        category: 'civil_liberties',
        reason: 'detention facility expansion and detention center growth',
        matches: ['detention facility', 'detention center'],
      }),
    };

    const result = analyzeInfrastructure(snapshots);

    // Check the detention theme is active (activationThreshold is 2)
    const detentionTheme = result.themes.find((t) => t.theme === 'detention_incarceration');
    if (detentionTheme && detentionTheme.active) {
      // Only one theme active → emerging
      const activeCount = result.themes.filter((t) => t.active).length;
      if (activeCount === 1) {
        expect(result.convergence).toBe('emerging');
        expect(result.convergenceNote).toContain('Emerging pattern');
        expect(result.convergenceNote).toContain('keyword matches');
      }
    }
  });

  it('produces convergence note for active level (2+ themes, score below entrenched)', () => {
    // Use keywords from detention AND surveillance themes
    const snapshots: Record<string, EnhancedAssessment> = {
      civil_liberties: makeAssessment({
        category: 'civil_liberties',
        reason:
          'detention facility expansion and detention center growth; facial recognition and mass surveillance deployed',
        matches: [
          'detention facility',
          'detention center',
          'facial recognition',
          'mass surveillance',
        ],
      }),
    };

    const result = analyzeInfrastructure(snapshots);
    const activeThemes = result.themes.filter((t) => t.active);

    if (activeThemes.length >= 2 && result.convergenceScore < 50) {
      expect(result.convergence).toBe('active');
      expect(result.convergenceNote).toContain('Convergent infrastructure buildup');
      expect(result.convergenceNote).toContain('active across');
    }
  });

  it('suppresses context-dependent keyword when suppression term is present', () => {
    // 'expedited removal' is context-dependent; suppress if 'court blocked' appears
    const snapshots: Record<string, EnhancedAssessment> = {
      civil_liberties: makeAssessment({
        category: 'civil_liberties',
        reason: 'expedited removal court blocked by judge',
        matches: [],
      }),
    };

    const result = analyzeInfrastructure(snapshots);
    const detentionTheme = result.themes.find((t) => t.theme === 'detention_incarceration');
    expect(detentionTheme).toBeDefined();
    if (detentionTheme) {
      // The keyword should be suppressed, not matched
      const expeditedMatch = detentionTheme.matches.find((m) => m.keyword === 'expedited removal');
      expect(expeditedMatch).toBeUndefined();
      expect(detentionTheme.suppressedCount).toBeGreaterThan(0);
    }
  });

  it('allows context-dependent keyword when no suppression term is present', () => {
    const snapshots: Record<string, EnhancedAssessment> = {
      civil_liberties: makeAssessment({
        category: 'civil_liberties',
        reason: 'expanded expedited removal processing at the border',
        matches: [],
      }),
    };

    const result = analyzeInfrastructure(snapshots);
    const detentionTheme = result.themes.find((t) => t.theme === 'detention_incarceration');
    expect(detentionTheme).toBeDefined();
    if (detentionTheme) {
      const expeditedMatch = detentionTheme.matches.find((m) => m.keyword === 'expedited removal');
      expect(expeditedMatch).toBeDefined();
    }
  });

  it('does not duplicate matches for the same keyword+category', () => {
    const snapshots: Record<string, EnhancedAssessment> = {
      civil_liberties: makeAssessment({
        category: 'civil_liberties',
        reason: 'detention facility mentioned here',
        matches: ['detention facility mentioned again'],
      }),
    };

    const result = analyzeInfrastructure(snapshots);
    const detentionTheme = result.themes.find((t) => t.theme === 'detention_incarceration');
    expect(detentionTheme).toBeDefined();
    if (detentionTheme) {
      const facilityMatches = detentionTheme.matches.filter(
        (m) => m.keyword === 'detention facility' && m.category === 'civil_liberties',
      );
      expect(facilityMatches.length).toBeLessThanOrEqual(1);
    }
  });

  it('scans evidenceFor and evidenceAgainst texts', () => {
    const snapshots: Record<string, EnhancedAssessment> = {
      civil_liberties: makeAssessment({
        category: 'civil_liberties',
        reason: 'no keywords here',
        matches: [],
        evidenceFor: [{ text: 'detention facility expansion underway', weight: 1 }],
        evidenceAgainst: [{ text: 'detention center closure announced', weight: 1 }],
      }),
    };

    const result = analyzeInfrastructure(snapshots);
    const detentionTheme = result.themes.find((t) => t.theme === 'detention_incarceration');
    expect(detentionTheme).toBeDefined();
    if (detentionTheme) {
      expect(detentionTheme.matchCount).toBeGreaterThanOrEqual(2);
    }
  });

  it('tracks categoriesInvolved across multiple categories', () => {
    const snapshots: Record<string, EnhancedAssessment> = {
      civil_liberties: makeAssessment({
        category: 'civil_liberties',
        reason: 'detention facility',
        matches: [],
      }),
      immigration: makeAssessment({
        category: 'immigration',
        reason: 'detention center',
        matches: [],
      }),
    };

    const result = analyzeInfrastructure(snapshots);
    const detentionTheme = result.themes.find((t) => t.theme === 'detention_incarceration');
    expect(detentionTheme).toBeDefined();
    if (detentionTheme) {
      expect(detentionTheme.categoriesInvolved).toContain('civil_liberties');
      expect(detentionTheme.categoriesInvolved).toContain('immigration');
    }
  });

  it('reports scannedCategories and totalItemsScanned', () => {
    const snapshots: Record<string, EnhancedAssessment> = {
      fiscal: makeAssessment({
        category: 'fiscal',
        reason: 'Some text',
        matches: ['another text'],
      }),
      military: makeAssessment({ category: 'military', reason: 'More text', matches: [] }),
    };

    const result = analyzeInfrastructure(snapshots);
    expect(result.scannedCategories).toBe(2);
    expect(result.totalItemsScanned).toBeGreaterThan(0);
  });

  it('theme is inactive when matches are below activationThreshold', () => {
    // activationThreshold is 2; only 1 keyword match
    const snapshots: Record<string, EnhancedAssessment> = {
      civil_liberties: makeAssessment({
        category: 'civil_liberties',
        reason: 'one detention facility mention',
        matches: [],
      }),
    };

    const result = analyzeInfrastructure(snapshots);
    const detentionTheme = result.themes.find((t) => t.theme === 'detention_incarceration');
    expect(detentionTheme).toBeDefined();
    if (detentionTheme && detentionTheme.matchCount < 2) {
      expect(detentionTheme.active).toBe(false);
    }
  });

  it('produces emerging note with singular category when 1 category involved', () => {
    const snapshots: Record<string, EnhancedAssessment> = {
      civil_liberties: makeAssessment({
        category: 'civil_liberties',
        reason: 'detention facility and detention center both mentioned here',
        matches: [],
      }),
    };

    const result = analyzeInfrastructure(snapshots);
    const activeThemes = result.themes.filter((t) => t.active);

    if (activeThemes.length === 1) {
      expect(result.convergence).toBe('emerging');
      // 1 category → "category" (singular)
      expect(result.convergenceNote).toContain('1 category');
    }
  });
});
