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
    judicialIndependence: {
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
    expect(findKeywordTier(rules.judicialIndependence, 'contempt of court')).toBe('capture');
    expect(findKeywordTier(rules.judicialIndependence, 'delayed compliance')).toBe('drift');
    expect(findKeywordTier(rules.judicialIndependence, 'injunction issued')).toBe('warning');
  });

  it('returns null for missing keyword', () => {
    expect(findKeywordTier(makeRules().judicialIndependence, 'nonexistent')).toBeNull();
  });
});

describe('applyRecommendation', () => {
  it('removes a keyword from specified category', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'injunction issued',
      category: 'judicialIndependence',
      action: 'remove',
      reason: 'FP 80%',
      occurrences: 8,
      fpRate: 0.8,
    });
    expect(change).toEqual({
      keyword: 'injunction issued',
      category: 'judicialIndependence',
      action: 'removed',
      fromTier: 'warning',
    });
    expect(rules.judicialIndependence.keywords.warning).not.toContain('injunction issued');
  });

  it('moves a keyword between tiers', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'delayed compliance',
      category: 'judicialIndependence',
      action: 'move',
      currentTier: 'drift',
      suggestedTier: 'warning',
      reason: 'Too broad for drift',
      occurrences: 3,
      fpRate: 0,
    });
    expect(change).toEqual({
      keyword: 'delayed compliance',
      category: 'judicialIndependence',
      action: 'moved',
      fromTier: 'drift',
      toTier: 'warning',
    });
    expect(rules.judicialIndependence.keywords.drift).not.toContain('delayed compliance');
    expect(rules.judicialIndependence.keywords.warning).toContain('delayed compliance');
  });

  it('returns null when keyword not found', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'nonexistent',
      category: 'judicialIndependence',
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
      category: 'judicialIndependence',
      action: 'move',
      currentTier: 'warning',
      suggestedTier: 'warning',
      reason: 'No change needed',
      occurrences: 1,
      fpRate: 0,
    });
    expect(change).toBeNull();
  });

  it('adds a new keyword to specified category and tier', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'judicial independence',
      category: 'judicialIndependence',
      action: 'add',
      suggestedTier: 'warning',
      reason: 'Missing from dictionary',
      occurrences: 5,
      fpRate: 0,
    });
    expect(change).toEqual({
      keyword: 'judicial independence',
      category: 'judicialIndependence',
      action: 'added',
      toTier: 'warning',
    });
    expect(rules.judicialIndependence.keywords.warning).toContain('judicial independence');
  });

  it('skips add when keyword already exists in any tier', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'contempt of court',
      category: 'judicialIndependence',
      action: 'add',
      suggestedTier: 'warning',
      reason: 'Already exists',
      occurrences: 3,
      fpRate: 0,
    });
    expect(change).toBeNull();
  });

  it('skips add when category does not exist', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'new keyword',
      category: 'nonexistent',
      action: 'add',
      suggestedTier: 'warning',
      reason: 'Bad category',
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
        category: 'judicialIndependence',
        action: 'remove',
        reason: 'FP',
        occurrences: 5,
        fpRate: 0.7,
      },
      {
        keyword: 'court ordered',
        category: 'judicialIndependence',
        action: 'remove',
        reason: 'FP',
        occurrences: 4,
        fpRate: 0.6,
      },
    ]);
    expect(changes).toHaveLength(2);
    expect(rules.judicialIndependence.keywords.warning).not.toContain('injunction issued');
    expect(rules.judicialIndependence.keywords.warning).not.toContain('court ordered');
    expect(rules.judicialIndependence.keywords.warning).toContain('preliminary injunction');
  });

  it('returns empty array for no applicable changes', () => {
    const rules = makeRules();
    const changes = applyAllRecommendations(rules, [
      {
        keyword: 'nonexistent',
        category: 'judicialIndependence',
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
    expect(source).toContain('judicialIndependence: {');
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
      {
        keyword: 'injunction issued',
        category: 'judicialIndependence',
        action: 'removed',
        fromTier: 'warning',
      },
    ]);
    expect(preview).toContain('1 change(s) to apply');
    expect(preview).toContain('REMOVE "injunction issued"');
    expect(preview).toContain('judicialIndependence.warning');
  });

  it('formats move changes', () => {
    const preview = formatChangePreview([
      {
        keyword: 'delayed compliance',
        category: 'judicialIndependence',
        action: 'moved',
        fromTier: 'drift',
        toTier: 'warning',
      },
    ]);
    expect(preview).toContain('MOVE "delayed compliance"');
    expect(preview).toContain('drift → warning');
  });

  it('formats add changes', () => {
    const preview = formatChangePreview([
      {
        keyword: 'judicial independence',
        category: 'judicialIndependence',
        action: 'added',
        toTier: 'warning',
      },
    ]);
    expect(preview).toContain('ADD "judicial independence"');
    expect(preview).toContain('judicialIndependence.warning');
  });

  it('shows no-changes message for empty array', () => {
    expect(formatChangePreview([])).toBe('No changes to apply.');
  });
});

// ---------------------------------------------------------------------------
// Additional branch coverage tests
// ---------------------------------------------------------------------------

describe('applyRecommendation — missing branch coverage', () => {
  it('returns null for move action with invalid suggestedTier', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'delayed compliance',
      category: 'judicialIndependence',
      action: 'move',
      currentTier: 'drift',
      suggestedTier: 'invalidTier',
      reason: 'Invalid tier',
      occurrences: 1,
      fpRate: 0,
    });
    expect(change).toBeNull();
  });

  it('returns null for move action without suggestedTier', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'delayed compliance',
      category: 'judicialIndependence',
      action: 'move',
      currentTier: 'drift',
      reason: 'No tier specified',
      occurrences: 1,
      fpRate: 0,
    });
    expect(change).toBeNull();
  });

  it('returns null for add action with invalid suggestedTier', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'new keyword',
      category: 'judicialIndependence',
      action: 'add',
      suggestedTier: 'nonexistentTier',
      reason: 'Invalid tier',
      occurrences: 1,
      fpRate: 0,
    });
    expect(change).toBeNull();
  });

  it('returns null for add action without suggestedTier', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'new keyword',
      category: 'judicialIndependence',
      action: 'add',
      reason: 'Missing tier',
      occurrences: 1,
      fpRate: 0,
    });
    expect(change).toBeNull();
  });

  it('handles multi-category recommendation for move', () => {
    const rules = makeRules();
    // Both categories have 'workforce reduction' — wait, only civilService does.
    // Test with comma-separated categories where first has the keyword.
    const change = applyRecommendation(rules, {
      keyword: 'workforce reduction',
      category: 'civilService, judicialIndependence',
      action: 'move',
      currentTier: 'warning',
      suggestedTier: 'drift',
      reason: 'Should be drift',
      occurrences: 2,
      fpRate: 0,
    });
    expect(change).toEqual({
      keyword: 'workforce reduction',
      category: 'civilService',
      action: 'moved',
      fromTier: 'warning',
      toTier: 'drift',
    });
    expect(rules.civilService.keywords.warning).not.toContain('workforce reduction');
    expect(rules.civilService.keywords.drift).toContain('workforce reduction');
  });

  it('handles multi-category recommendation for remove', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'injunction issued',
      category: 'judicialIndependence, civilService',
      action: 'remove',
      reason: 'FP',
      occurrences: 5,
      fpRate: 0.8,
    });
    expect(change).toEqual({
      keyword: 'injunction issued',
      category: 'judicialIndependence',
      action: 'removed',
      fromTier: 'warning',
    });
  });

  it('falls back to all categories when move category is empty string', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'contempt of court',
      category: '',
      action: 'move',
      currentTier: 'capture',
      suggestedTier: 'drift',
      reason: 'Demote',
      occurrences: 1,
      fpRate: 0,
    });
    // Should find it in judicialIndependence (first category key)
    expect(change).toEqual({
      keyword: 'contempt of court',
      category: 'judicialIndependence',
      action: 'moved',
      fromTier: 'capture',
      toTier: 'drift',
    });
  });

  it('falls back to all categories when remove category is empty string', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'schedule f',
      category: '',
      action: 'remove',
      reason: 'FP',
      occurrences: 1,
      fpRate: 1,
    });
    // Should find it in civilService
    expect(change).toEqual({
      keyword: 'schedule f',
      category: 'civilService',
      action: 'removed',
      fromTier: 'capture',
    });
  });

  it('skips move when category has the keyword but target category does not exist', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'some keyword',
      category: 'nonexistent',
      action: 'move',
      suggestedTier: 'drift',
      reason: 'Bad cat',
      occurrences: 1,
      fpRate: 0,
    });
    expect(change).toBeNull();
  });

  it('skips remove when target category does not exist', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'some keyword',
      category: 'nonexistent',
      action: 'remove',
      reason: 'Bad cat',
      occurrences: 1,
      fpRate: 0,
    });
    expect(change).toBeNull();
  });

  it('does not duplicate keyword on move when already present in target tier', () => {
    const rules = makeRules();
    // Manually put 'delayed compliance' into warning too
    rules.judicialIndependence.keywords.warning.push('delayed compliance');

    const change = applyRecommendation(rules, {
      keyword: 'delayed compliance',
      category: 'judicialIndependence',
      action: 'move',
      currentTier: 'drift',
      suggestedTier: 'warning',
      reason: 'Move to warning',
      occurrences: 1,
      fpRate: 0,
    });
    expect(change).toEqual({
      keyword: 'delayed compliance',
      category: 'judicialIndependence',
      action: 'moved',
      fromTier: 'drift',
      toTier: 'warning',
    });
    // Should only appear once in warning
    const warningOccurrences = rules.judicialIndependence.keywords.warning.filter(
      (k) => k === 'delayed compliance',
    );
    expect(warningOccurrences).toHaveLength(1);
  });

  it('case-insensitive keyword matching for findKeywordTier', () => {
    const rules = makeRules();
    expect(findKeywordTier(rules.judicialIndependence, 'Contempt Of Court')).toBe('capture');
    expect(findKeywordTier(rules.judicialIndependence, 'INJUNCTION ISSUED')).toBe('warning');
  });

  it('handles unrecognized action type (falls through to null)', () => {
    const rules = makeRules();
    const change = applyRecommendation(rules, {
      keyword: 'something',
      category: 'judicialIndependence',
      action: 'unknown' as 'remove',
      reason: 'test',
      occurrences: 1,
      fpRate: 0,
    });
    expect(change).toBeNull();
  });
});

describe('applyAllRecommendations — mixed operations', () => {
  it('skips non-applicable recommendations and includes applicable ones', () => {
    const rules = makeRules();
    const changes = applyAllRecommendations(rules, [
      {
        keyword: 'nonexistent',
        category: 'judicialIndependence',
        action: 'remove',
        reason: 'Not found',
        occurrences: 1,
        fpRate: 1,
      },
      {
        keyword: 'injunction issued',
        category: 'judicialIndependence',
        action: 'remove',
        reason: 'FP',
        occurrences: 5,
        fpRate: 0.7,
      },
      {
        keyword: 'new term',
        category: 'civilService',
        action: 'add',
        suggestedTier: 'warning',
        reason: 'Missing',
        occurrences: 3,
        fpRate: 0,
      },
    ]);
    expect(changes).toHaveLength(2);
    expect(changes[0].action).toBe('removed');
    expect(changes[1].action).toBe('added');
  });
});

describe('serializeRules — missing branch coverage', () => {
  it('handles rules without volumeThreshold', () => {
    const rules: AssessmentRules = {
      testCategory: {
        keywords: { capture: ['a'], drift: ['b'], warning: ['c'] },
      },
    };
    const source = serializeRules(rules);
    expect(source).not.toContain('volumeThreshold');
    expect(source).toContain("'a',");
    expect(source).toContain("'b',");
    expect(source).toContain("'c',");
  });
});
