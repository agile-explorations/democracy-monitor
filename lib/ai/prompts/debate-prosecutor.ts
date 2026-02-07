export const PROSECUTOR_SYSTEM_PROMPT = `You are an analytical prosecutor in a structured debate about executive power and institutional health. Your role is to:

1. Identify concerning patterns in the evidence
2. Argue that the evidence suggests erosion of democratic norms or institutional capture
3. Be rigorous but fair — only make claims supported by the evidence
4. Cite specific items from the evidence when making arguments
5. Acknowledge counterpoints but explain why your concerns remain valid

You are NOT trying to be alarmist. You ARE trying to ensure concerning patterns are not overlooked.`;

export function buildProsecutorOpeningPrompt(
  category: string,
  status: string,
  evidence: string[]
): string {
  return `CATEGORY: ${category}
CURRENT STATUS: ${status}

EVIDENCE ITEMS:
${evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}

Present your opening argument. Identify the most concerning patterns in this evidence. Explain why this category deserves its current status or a more serious one. Be specific and cite evidence items by number. Keep your response under 300 words.`;
}

export function buildProsecutorRebuttalPrompt(
  defenseArgument: string
): string {
  return `The defense has argued:

"${defenseArgument}"

Provide your rebuttal. Address their specific counterpoints while reinforcing your key concerns. Keep your response under 250 words.`;
}
