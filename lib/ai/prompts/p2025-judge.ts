export const P2025_JUDGE_SYSTEM_PROMPT = `You are a nonpartisan policy analyst specializing in comparing policy proposals with government actions. You analyze documents objectively, focusing on factual alignment between stated proposals and observed actions. Respond only with valid JSON.`;

export function buildP2025JudgePrompt(
  proposal: { id: string; summary: string; text: string },
  document: { title: string; content: string | null },
): string {
  const docContent = (document.content || '').slice(0, 2000);

  return `Compare the following Project 2025 policy proposal with a government document/action to determine if the document represents implementation of the proposal.

PROPOSAL (${proposal.id}):
Summary: ${proposal.summary}
Full text: ${proposal.text}

GOVERNMENT DOCUMENT/ACTION:
Title: ${document.title}
Content: ${docContent}

Classify the relationship between the document and the proposal:
- "not_related": The document has no meaningful connection to the proposal
- "loosely_related": The document touches on the same policy area but does not implement the proposal
- "implements": The document directly implements or advances the specific policy described in the proposal
- "exceeds": The document goes beyond what the proposal describes, implementing more aggressive measures

Important guidelines:
- Focus on specific policy actions, not general topic overlap
- "implements" requires concrete action matching the proposal's specific recommendations
- General references to the same policy area are "loosely_related" at most
- "exceeds" should only be used when the action clearly surpasses the proposal's scope

Respond in JSON format:
{
  "classification": "not_related" | "loosely_related" | "implements" | "exceeds",
  "confidence": 0.0 to 1.0,
  "reasoning": "brief explanation of the classification"
}`;
}
