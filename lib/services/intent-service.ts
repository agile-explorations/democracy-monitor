import { classifyGovernance } from '@/lib/data/governance-framework';
import { RHETORIC_KEYWORDS, ACTION_KEYWORDS } from '@/lib/data/intent-keywords';
import type {
  PolicyArea,
  IntentScore,
  IntentAssessment,
  GovernanceCategory,
  IntentStatement,
} from '@/lib/types/intent';
import { POLICY_AREAS } from '@/lib/types/intent';
import { matchKeyword } from '@/lib/utils/keyword-match';

function scoreText(
  text: string,
  keywords: { authoritarian: string[]; democratic: string[] },
): number {
  let authCount = 0;
  let demoCount = 0;

  for (const kw of keywords.authoritarian) {
    if (matchKeyword(text, kw)) authCount++;
  }
  for (const kw of keywords.democratic) {
    if (matchKeyword(text, kw)) demoCount++;
  }

  if (authCount === 0 && demoCount === 0) return 0;

  // Scale: positive = authoritarian, negative = democratic
  const total = authCount + demoCount;
  const raw = (authCount - demoCount) / total;
  return Math.round(raw * 2 * 100) / 100; // scale to -2 to +2
}

export function scoreStatements(statements: IntentStatement[]): IntentAssessment {
  const policyAreas = {} as Record<PolicyArea, IntentScore>;
  const rhetoricStatements = statements.filter((s) => s.type === 'rhetoric');
  const actionStatements = statements.filter((s) => s.type === 'action');

  for (const area of POLICY_AREAS) {
    const rhetoricTexts = rhetoricStatements
      .filter((s) => s.policyArea === area)
      .map((s) => s.text);
    const actionTexts = actionStatements.filter((s) => s.policyArea === area).map((s) => s.text);

    const rhetoricScore =
      rhetoricTexts.length > 0
        ? rhetoricTexts.reduce((sum, t) => sum + scoreText(t, RHETORIC_KEYWORDS[area]), 0) /
          rhetoricTexts.length
        : 0;

    const actionScore =
      actionTexts.length > 0
        ? actionTexts.reduce((sum, t) => sum + scoreText(t, ACTION_KEYWORDS[area]), 0) /
          actionTexts.length
        : 0;

    policyAreas[area] = {
      rhetoric: Math.round(rhetoricScore * 100) / 100,
      action: Math.round(actionScore * 100) / 100,
      gap: Math.round(Math.abs(rhetoricScore - actionScore) * 100) / 100,
    };
  }

  // Calculate overall scores
  const allRhetoric = Object.values(policyAreas).map((p) => p.rhetoric);
  const allActions = Object.values(policyAreas).map((p) => p.action);

  const avgRhetoric =
    allRhetoric.length > 0 ? allRhetoric.reduce((a, b) => a + b, 0) / allRhetoric.length : 0;
  const avgAction =
    allActions.length > 0 ? allActions.reduce((a, b) => a + b, 0) / allActions.length : 0;

  let overallScore = (avgRhetoric + avgAction) / 2;
  const overallGap = Math.abs(avgRhetoric - avgAction);

  // Rhetoric alone should not push classification beyond "competitive_authoritarian".
  // Require meaningful action-side signals (>= 0.3) to reach alarming tiers.
  if (avgAction < 0.3 && overallScore > 0.5) {
    overallScore = Math.min(overallScore, 0.5);
  }

  const governance = classifyGovernance(overallScore);

  // Confidence based on data volume and diversity
  const confidence =
    Math.min(1, statements.length / 20) * 0.7 +
    (new Set(statements.map((s) => s.policyArea)).size / POLICY_AREAS.length) * 0.3;

  return {
    overall: governance.key as GovernanceCategory,
    confidence: Math.round(confidence * 100) / 100,
    rhetoricScore: Math.round(avgRhetoric * 100) / 100,
    actionScore: Math.round(avgAction * 100) / 100,
    gap: Math.round(overallGap * 100) / 100,
    policyAreas,
    recentStatements: statements.slice(0, 20),
    assessedAt: new Date().toISOString(),
  };
}

export function analyzeRhetoricActionGap(assessment: IntentAssessment): string[] {
  const gaps: string[] = [];

  for (const [area, scores] of Object.entries(assessment.policyAreas)) {
    if (scores.gap > 0.5) {
      const direction =
        scores.rhetoric > scores.action
          ? 'Rhetoric is more authoritarian than actions'
          : 'Actions are more authoritarian than rhetoric';
      gaps.push(
        `${formatPolicyArea(area as PolicyArea)}: ${direction} (gap: ${scores.gap.toFixed(1)})`,
      );
    }
  }

  return gaps;
}

function formatPolicyArea(area: PolicyArea): string {
  const labels: Record<PolicyArea, string> = {
    rule_of_law: 'Rule of Law',
    civil_liberties: 'Civil Liberties',
    elections: 'Elections',
    media_freedom: 'Media Freedom',
    institutional_independence: 'Institutional Independence',
  };
  return labels[area];
}
