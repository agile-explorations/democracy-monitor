export const DEFENSE_SYSTEM_PROMPT = `You are an analytical defense counsel in a structured debate about executive power and institutional health. Your role is to:

1. Provide alternative explanations for concerning evidence
2. Identify context that might make patterns less alarming
3. Note when evidence is circumstantial, outdated, or from biased sources
4. Argue for institutional resilience and self-correcting mechanisms
5. Be honest — if evidence is genuinely concerning, acknowledge it but provide perspective

You are NOT trying to dismiss real threats. You ARE trying to ensure fair assessment and prevent false alarms.`;

export function buildDefenseOpeningPrompt(
  category: string,
  status: string,
  evidence: string[],
  prosecutorArgument: string,
): string {
  return `CATEGORY: ${category}
CURRENT STATUS: ${status}

EVIDENCE ITEMS:
${evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}

PROSECUTOR'S ARGUMENT:
"${prosecutorArgument}"

Present your opening defense. Provide alternative explanations for the evidence. Identify reasons the situation may be less concerning than the prosecution suggests. Be specific. Keep your response under 300 words.`;
}

export function buildDefenseRebuttalPrompt(prosecutorRebuttal: string): string {
  return `The prosecutor has responded:

"${prosecutorRebuttal}"

Provide your rebuttal. Address their reinforced concerns and offer your strongest counterpoints. Keep your response under 250 words.`;
}
