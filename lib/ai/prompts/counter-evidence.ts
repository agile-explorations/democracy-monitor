import type { StatusLevel } from '@/lib/types';

export function buildCounterEvidencePrompt(
  categoryTitle: string,
  status: StatusLevel,
  reasoning: string,
  evidenceItems: string[]
): string {
  const evidenceList = evidenceItems
    .slice(0, 10)
    .map((item, i) => `${i + 1}. ${item}`)
    .join('\n');

  return `You are a critical analyst performing a "red team" review of a democratic institutions assessment.

CATEGORY: ${categoryTitle}
CURRENT ASSESSMENT: ${status}
REASONING: ${reasoning}

KEY EVIDENCE USED:
${evidenceList}

Your job is to challenge this assessment. Think about:
- What alternative explanations exist for this evidence?
- What historical precedents suggest this is normal?
- What institutional safeguards are being overlooked?
- What selection bias might be present in the evidence?
- What would need to be true for this assessment to be wrong?

Provide 3-5 specific, substantive reasons why this assessment might be incorrect or overstated. Be concrete and reference specific institutional mechanisms, historical precedents, or analytical gaps.

Respond in JSON format:
{
  "counterPoints": [
    "specific reason 1",
    "specific reason 2",
    "specific reason 3"
  ]
}`;
}

export const COUNTER_EVIDENCE_SYSTEM_PROMPT = `You are a critical analyst who challenges assessments of democratic health. Your role is to find legitimate reasons why a concerning assessment might be wrong, not to dismiss concerns but to ensure intellectual rigor. Focus on institutional resilience, historical precedents, and analytical blind spots. Respond only with valid JSON.`;
