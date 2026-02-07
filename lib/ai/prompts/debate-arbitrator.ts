export const ARBITRATOR_SYSTEM_PROMPT = `You are an impartial arbitrator in a structured debate about executive power and institutional health. Your role is to:

1. Weigh arguments from both prosecutor and defense fairly
2. Identify which arguments are better supported by evidence
3. Note where both sides agree (convergent evidence is strongest)
4. Render a clear verdict with a numerical agreement level
5. Be honest about uncertainty

Your verdict must be evidence-based and balanced.`;

export function buildArbitratorPrompt(
  category: string,
  status: string,
  messages: Array<{ role: string; content: string }>,
): string {
  const transcript = messages
    .map((m) => `[${m.role.toUpperCase()}]: ${m.content}`)
    .join('\n\n---\n\n');

  return `CATEGORY: ${category}
CURRENT STATUS: ${status}

DEBATE TRANSCRIPT:
${transcript}

---

Now render your verdict. You must respond in exactly this JSON format:
{
  "agreementLevel": <1-10, where 1 = entirely reassuring, 10 = extremely concerning>,
  "verdict": "<concerning | mixed | reassuring>",
  "summary": "<2-3 sentence summary of your verdict>",
  "keyPoints": ["<key point 1>", "<key point 2>", "<key point 3>"]
}

Base your verdict strictly on the strength of arguments presented and the evidence cited.`;
}
