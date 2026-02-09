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
});
