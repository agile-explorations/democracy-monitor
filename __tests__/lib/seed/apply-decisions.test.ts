import { describe, it, expect } from 'vitest';
import {
  findKeywordTier,
  applyRecommendation,
  applyAllRecommendations,
  serializeRules,
  formatChangePreview,
} from '@/lib/seed/apply-decisions';
import type { AssessmentRules } from '@/lib/types';

function makeRules(): AssessmentRules {
  return {
    courts: {
      keywords: {
        capture: ['contempt of court', 'defied court order'],
        drift: ['delayed compliance', 'partial compliance'],
        warning: ['injunction issued', 'preliminary injunction', 'court ordered'],
      },
      volumeThreshold: { warning: 5, drift: 10, capture: 15 },
    },
    civilService: {
      keywords: {
        capture: ['schedule f', 'mass termination'],
        drift: ['reclassification', 'excepted service'],
        warning: ['workforce reduction', 'reorganization'],
      },
      volumeThreshold: { warning: 5, drift: 10, capture: 20 },
    },
  };
}

describe('findKeywordTier', () => {
  it('finds keyword in correct tier', () => {
    const rules = makeRules();
    expect(findKeywordTier(rules.courts, 'contempt of court')).toBe('capture');
    expect(findKeywordTier(rules.courts, 'delayed compliance')).toBe('drift');
    expect(findKeywordTier(rules.courts, 'injunction issued')).toBe('warning');
  });

  it('returns null for missing keyword', () => {
    expect(findKeywordTier(makeRules().courts, 'nonexistent')).toBeNull();
  });
});

describe('applyRecommendation', () => {
  it('removes a keyword from specified category', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'injunction issued',
      category: 'courts',
      action: 'remove',
      reason: 'FP 80%',
      occurrences: 8,
      fpRate: 0.8,
    });
    expect(change).toEqual({
      keyword: 'injunction issued',
      category: 'courts',
      action: 'removed',
      fromTier: 'warning',
    });
    expect(rules.courts.keywords.warning).not.toContain('injunction issued');
  });

  it('moves a keyword between tiers', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'delayed compliance',
      category: 'courts',
      action: 'move',
      currentTier: 'drift',
      suggestedTier: 'warning',
      reason: 'Too broad for drift',
      occurrences: 3,
      fpRate: 0,
    });
    expect(change).toEqual({
      keyword: 'delayed compliance',
      category: 'courts',
      action: 'moved',
      fromTier: 'drift',
      toTier: 'warning',
    });
    expect(rules.courts.keywords.drift).not.toContain('delayed compliance');
    expect(rules.courts.keywords.warning).toContain('delayed compliance');
  });

  it('returns null when keyword not found', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'nonexistent',
      category: 'courts',
      action: 'remove',
      reason: 'test',
      occurrences: 1,
      fpRate: 1,
    });
    expect(change).toBeNull();
  });

  it('returns null when keyword already in target tier', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'injunction issued',
      category: 'courts',
      action: 'move',
      currentTier: 'warning',
      suggestedTier: 'warning',
      reason: 'No change needed',
      occurrences: 1,
      fpRate: 0,
    });
    expect(change).toBeNull();
  });
});

describe('applyAllRecommendations', () => {
  it('applies multiple changes', () => {
    const rules = makeRules();
    const changes = applyAllRecommendations(rules, [
      {
        keyword: 'injunction issued',
        category: 'courts',
        action: 'remove',
        reason: 'FP',
        occurrences: 5,
        fpRate: 0.7,
      },
      {
        keyword: 'court ordered',
        category: 'courts',
        action: 'remove',
        reason: 'FP',
        occurrences: 4,
        fpRate: 0.6,
      },
    ]);
    expect(changes).toHaveLength(2);
    expect(rules.courts.keywords.warning).not.toContain('injunction issued');
    expect(rules.courts.keywords.warning).not.toContain('court ordered');
    expect(rules.courts.keywords.warning).toContain('preliminary injunction');
  });

  it('returns empty array for no applicable changes', () => {
    const rules = makeRules();
    const changes = applyAllRecommendations(rules, [
      {
        keyword: 'nonexistent',
        category: 'courts',
        action: 'remove',
        reason: 'test',
        occurrences: 1,
        fpRate: 1,
      },
    ]);
    expect(changes).toHaveLength(0);
  });
});

describe('serializeRules', () => {
  it('produces valid TypeScript source', () => {
    const rules = makeRules();
    const source = serializeRules(rules);
    expect(source).toContain("import type { AssessmentRules } from '@/lib/types'");
    expect(source).toContain('export const ASSESSMENT_RULES: AssessmentRules = {');
    expect(source).toContain('courts: {');
    expect(source).toContain("'contempt of court',");
    expect(source).toContain('volumeThreshold: { warning: 5, drift: 10, capture: 15 },');
  });

  it('handles empty keyword arrays', () => {
    const rules: AssessmentRules = {
      test: {
        keywords: { capture: [], drift: [], warning: ['only one'] },
      },
    };
    const source = serializeRules(rules);
    expect(source).toContain('capture: [],');
    expect(source).toContain('drift: [],');
    expect(source).toContain("'only one',");
  });

  it('escapes single quotes in keywords', () => {
    const rules: AssessmentRules = {
      test: {
        keywords: { capture: [], drift: [], warning: ["it's a test"] },
      },
    };
    const source = serializeRules(rules);
    expect(source).toContain("it\\'s a test");
  });
});

describe('formatChangePreview', () => {
  it('formats removal changes', () => {
    const preview = formatChangePreview([
      { keyword: 'injunction issued', category: 'courts', action: 'removed', fromTier: 'warning' },
    ]);
    expect(preview).toContain('1 change(s) to apply');
    expect(preview).toContain('REMOVE "injunction issued"');
    expect(preview).toContain('courts.warning');
  });

  it('formats move changes', () => {
    const preview = formatChangePreview([
      {
        keyword: 'delayed compliance',
        category: 'courts',
        action: 'moved',
        fromTier: 'drift',
        toTier: 'warning',
      },
    ]);
    expect(preview).toContain('MOVE "delayed compliance"');
    expect(preview).toContain('drift → warning');
  });

  it('shows no-changes message for empty array', () => {
    expect(formatChangePreview([])).toBe('No changes to apply.');
  });
});
