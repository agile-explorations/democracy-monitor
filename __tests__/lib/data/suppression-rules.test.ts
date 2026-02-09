import { describe, it, expect } from 'vitest';
import { ASSESSMENT_RULES } from '@/lib/data/assessment-rules';
import { NEGATION_PATTERNS, SUPPRESSION_RULES } from '@/lib/data/suppression-rules';

describe('SUPPRESSION_RULES', () => {
  it('all rules reference valid categories in ASSESSMENT_RULES', () => {
    for (const category of Object.keys(SUPPRESSION_RULES)) {
      expect(
        ASSESSMENT_RULES[category],
        `Suppression rules reference unknown category "${category}"`,
      ).toBeDefined();
    }
  });

  it('no duplicate rules for the same keyword within a category', () => {
    for (const [category, rules] of Object.entries(SUPPRESSION_RULES)) {
      const keywords = rules.map((r) => r.keyword.toLowerCase());
      const uniqueKeywords = new Set(keywords);
      expect(keywords.length, `Category "${category}" has duplicate suppression rules`).toBe(
        uniqueKeywords.size,
      );
    }
  });

  it('all suppress_if_any arrays are non-empty', () => {
    for (const [category, rules] of Object.entries(SUPPRESSION_RULES)) {
      for (const rule of rules) {
        expect(
          rule.suppress_if_any.length,
          `Rule for "${rule.keyword}" in "${category}" has empty suppress_if_any`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('all suppression terms are non-empty strings', () => {
    for (const [category, rules] of Object.entries(SUPPRESSION_RULES)) {
      for (const rule of rules) {
        for (const term of rule.suppress_if_any) {
          expect(
            term.trim().length,
            `Empty suppression term in "${rule.keyword}" rule for "${category}"`,
          ).toBeGreaterThan(0);
        }
        if (rule.downweight_if_any) {
          for (const term of rule.downweight_if_any) {
            expect(
              term.trim().length,
              `Empty downweight term in "${rule.keyword}" rule for "${category}"`,
            ).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

describe('NEGATION_PATTERNS', () => {
  it('has at least 5 patterns', () => {
    expect(NEGATION_PATTERNS.length).toBeGreaterThanOrEqual(5);
  });

  it('all patterns are non-empty strings', () => {
    for (const pattern of NEGATION_PATTERNS) {
      expect(pattern.trim().length).toBeGreaterThan(0);
    }
  });

  it('no duplicate patterns', () => {
    const lower = NEGATION_PATTERNS.map((p) => p.toLowerCase());
    expect(lower.length).toBe(new Set(lower).size);
  });
});
