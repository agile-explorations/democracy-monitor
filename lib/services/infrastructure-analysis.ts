import { INFRASTRUCTURE_THEMES, getAllKeywords } from '@/lib/data/infrastructure-keywords';
import type { InfrastructureSuppressionRule } from '@/lib/data/infrastructure-keywords';
import type {
  ConvergenceLevel,
  InfrastructureAssessment,
  InfrastructureKeywordMatch,
  InfrastructureThemeResult,
} from '@/lib/types/infrastructure';
import { matchKeyword } from '@/lib/utils/keyword-match';
import type { EnhancedAssessment } from './ai-assessment-service';

/**
 * Check if a context-dependent keyword should be suppressed based on co-occurring terms.
 */
function isSuppressedByRule(
  text: string,
  keyword: string,
  rules: InfrastructureSuppressionRule[],
): boolean {
  const lower = text.toLowerCase();
  for (const rule of rules) {
    if (rule.keyword.toLowerCase() !== keyword.toLowerCase()) continue;
    for (const term of rule.suppress_if_any) {
      if (lower.includes(term.toLowerCase())) return true;
    }
  }
  return false;
}

/**
 * Analyze current snapshots for cross-cutting infrastructure patterns.
 * Scans assessment matches, reasons, and evidence for infrastructure keywords.
 */
export function analyzeInfrastructure(
  snapshots: Record<string, EnhancedAssessment>,
): InfrastructureAssessment {
  const categories = Object.keys(snapshots);
  let totalItemsScanned = 0;

  const themes: InfrastructureThemeResult[] = INFRASTRUCTURE_THEMES.map((config) => {
    const matches: InfrastructureKeywordMatch[] = [];
    const categoriesInvolved = new Set<string>();
    let suppressedCount = 0;
    const allKeywords = getAllKeywords(config);
    const contextDependent = new Set(config.contextDependentKeywords.map((k) => k.toLowerCase()));

    for (const [cat, assessment] of Object.entries(snapshots)) {
      // Build text corpus from all available assessment data
      const texts = [
        assessment.reason,
        ...assessment.matches,
        ...assessment.evidenceFor.map((e) => e.text),
        ...assessment.evidenceAgainst.map((e) => e.text),
      ].filter(Boolean);

      totalItemsScanned += texts.length;

      for (const text of texts) {
        for (const keyword of allKeywords) {
          if (!matchKeyword(text, keyword)) continue;

          // Deduplicate by keyword+category
          const alreadyMatched = matches.some((m) => m.keyword === keyword && m.category === cat);
          if (alreadyMatched) continue;

          // Check suppression for context-dependent keywords
          if (contextDependent.has(keyword.toLowerCase())) {
            if (isSuppressedByRule(text, keyword, config.suppressionRules)) {
              suppressedCount++;
              continue;
            }
          }

          matches.push({ keyword, source: text, category: cat });
          categoriesInvolved.add(cat);
        }
      }
    }

    return {
      theme: config.theme,
      label: config.label,
      description: config.description,
      active: matches.length >= config.activationThreshold,
      matchCount: matches.length,
      matches,
      categoriesInvolved: Array.from(categoriesInvolved),
      suppressedCount,
    };
  });

  const activeThemeCount = themes.filter((t) => t.active).length;
  const convergence = getConvergenceLevel(activeThemeCount);
  const convergenceNote = buildConvergenceNote(themes, convergence);

  return {
    themes,
    activeThemeCount,
    convergence,
    convergenceNote,
    scannedCategories: categories.length,
    totalItemsScanned,
    assessedAt: new Date().toISOString(),
  };
}

/**
 * Run infrastructure analysis per week to produce a time-series of convergence states.
 * Each entry in weeklySnapshots is a Record<category, EnhancedAssessment> for that week.
 */
export function analyzeInfrastructureOverTime(
  weeklySnapshots: Array<{ week: string; snapshots: Record<string, EnhancedAssessment> }>,
): Array<{ week: string; assessment: InfrastructureAssessment }> {
  return weeklySnapshots.map(({ week, snapshots }) => ({
    week,
    assessment: analyzeInfrastructure(snapshots),
  }));
}

function getConvergenceLevel(activeCount: number): ConvergenceLevel {
  if (activeCount === 0) return 'none';
  if (activeCount === 1) return 'emerging';
  return 'convergent';
}

function buildConvergenceNote(
  themes: InfrastructureThemeResult[],
  convergence: ConvergenceLevel,
): string {
  const active = themes.filter((t) => t.active);

  if (convergence === 'none') {
    return 'No authoritarian infrastructure patterns detected across monitored categories.';
  }

  if (convergence === 'emerging') {
    const theme = active[0];
    return `Emerging pattern: ${theme.label} signals detected across ${theme.categoriesInvolved.length} categor${theme.categoriesInvolved.length === 1 ? 'y' : 'ies'} (${theme.matchCount} keyword matches).`;
  }

  // convergent
  const themeNames = active.map((t) => t.label).join(', ');
  const totalCategories = new Set(active.flatMap((t) => t.categoriesInvolved)).size;
  return `Convergent infrastructure buildup: ${themeNames} — active across ${totalCategories} categories. Multiple authoritarian infrastructure dimensions are developing simultaneously.`;
}
