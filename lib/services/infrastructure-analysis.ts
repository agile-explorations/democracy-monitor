import { INFRASTRUCTURE_THEMES, getAllKeywords } from '@/lib/data/infrastructure-keywords';
import type { InfrastructureSuppressionRule } from '@/lib/data/infrastructure-keywords';
import { CONVERGENCE_ENTRENCHED_THRESHOLD } from '@/lib/methodology/scoring-config';
import type { EnhancedAssessment } from '@/lib/types';
import type {
  ConvergenceLevel,
  InfrastructureAssessment,
  InfrastructureKeywordMatch,
  InfrastructureThemeResult,
} from '@/lib/types/infrastructure';
import { matchKeyword } from '@/lib/utils/keyword-match';

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

function analyzeTheme(
  config: (typeof INFRASTRUCTURE_THEMES)[number],
  snapshots: Record<string, EnhancedAssessment>,
): { result: InfrastructureThemeResult; itemsScanned: number } {
  const matches: InfrastructureKeywordMatch[] = [];
  const categoriesInvolved = new Set<string>();
  let suppressedCount = 0;
  let itemsScanned = 0;
  const allKeywords = getAllKeywords(config);
  const contextDependent = new Set(config.contextDependentKeywords.map((k) => k.toLowerCase()));

  for (const [cat, assessment] of Object.entries(snapshots)) {
    const texts = [
      assessment.reason,
      ...assessment.matches,
      ...assessment.evidenceFor.map((e) => e.text),
      ...assessment.evidenceAgainst.map((e) => e.text),
    ].filter(Boolean);

    itemsScanned += texts.length;

    for (const text of texts) {
      for (const keyword of allKeywords) {
        if (!matchKeyword(text, keyword)) continue;

        const alreadyMatched = matches.some((m) => m.keyword === keyword && m.category === cat);
        if (alreadyMatched) continue;

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
    result: {
      theme: config.theme,
      label: config.label,
      description: config.description,
      active: matches.length >= config.activationThreshold,
      matchCount: matches.length,
      intensity: matches.length,
      matches,
      categoriesInvolved: Array.from(categoriesInvolved),
      suppressedCount,
    },
    itemsScanned,
  };
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
    const { result, itemsScanned } = analyzeTheme(config, snapshots);
    totalItemsScanned += itemsScanned;
    return result;
  });

  const activeThemeCount = themes.filter((t) => t.active).length;
  const convergenceScore = computeConvergenceScore(themes);
  const convergence = getConvergenceLevel(convergenceScore, activeThemeCount);
  const convergenceNote = buildConvergenceNote(themes, convergence);

  return {
    themes,
    activeThemeCount,
    convergence,
    convergenceScore,
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

/**
 * Compute multiplicative convergence score from active theme intensities.
 * When 0–1 themes are active, returns 0 (no cross-cutting pattern).
 * With 2+ themes, returns the product of their intensities.
 */
export function computeConvergenceScore(themes: InfrastructureThemeResult[]): number {
  const activeIntensities = themes.map((t) => t.intensity).filter((i) => i > 0);
  if (activeIntensities.length < 2) return 0;
  return activeIntensities.reduce((product, i) => product * i, 1);
}

export function getConvergenceLevel(score: number, activeCount: number): ConvergenceLevel {
  if (activeCount === 0) return 'none';
  if (activeCount === 1) return 'emerging';
  if (score >= CONVERGENCE_ENTRENCHED_THRESHOLD) return 'entrenched';
  return 'active';
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

  const themeNames = active.map((t) => t.label).join(', ');
  const totalCategories = new Set(active.flatMap((t) => t.categoriesInvolved)).size;

  if (convergence === 'active') {
    return `Convergent infrastructure buildup: ${themeNames} — active across ${totalCategories} categories. Multiple authoritarian infrastructure dimensions are developing simultaneously.`;
  }

  // entrenched
  return `Entrenched infrastructure pattern: ${themeNames} — sustained across ${totalCategories} categories. Cross-cutting authoritarian infrastructure is deeply established with high intensity.`;
}
