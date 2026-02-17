/**
 * Maps the 5 rhetoric PolicyAreas to the 11 assessment categories.
 *
 * Rhetoric (intent_statements) is classified into 5 policy areas by
 * classifyPolicyArea(). Assessment keywords (assessment-rules.ts) are
 * organized by 11 institutional categories. This mapping bridges them
 * for rhetoric-to-keyword gap analysis.
 *
 * Many-to-many: a category can appear in multiple policy areas (e.g. igs
 * maps from both rule_of_law and institutional_independence), and each
 * policy area maps to multiple categories. Five categories are intentionally
 * unmapped (civilService, fiscal, military, hatch, infoAvailability) —
 * they get keyword proposals from other feedback loops.
 */
import type { PolicyArea } from '@/lib/types/intent';

export const POLICY_AREA_CATEGORIES: Record<PolicyArea, string[]> = {
  rule_of_law: ['courts', 'igs'],
  civil_liberties: ['courts', 'executiveActions'],
  elections: ['elections'],
  media_freedom: ['mediaFreedom'],
  institutional_independence: ['rulemaking', 'executiveActions', 'igs'],
};

/** Collect rhetoric texts by assessment category using the PolicyArea mapping. */
export function mapPolicyAreaToCategories(
  textsByPolicyArea: Map<string, string[]>,
): Map<string, string[]> {
  const byCategory = new Map<string, string[]>();

  for (const [area, texts] of textsByPolicyArea) {
    const categories = POLICY_AREA_CATEGORIES[area as PolicyArea] ?? [];
    for (const category of categories) {
      const existing = byCategory.get(category) ?? [];
      existing.push(...texts);
      byCategory.set(category, existing);
    }
  }

  return byCategory;
}
