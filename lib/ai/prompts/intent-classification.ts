export function buildIntentClassificationPrompt(
  statements: Array<{ text: string; source: string; date: string }>,
): string {
  const statementsText = statements
    .slice(0, 15)
    .map((s, i) => `${i + 1}. "${s.text}" (${s.source}, ${s.date})`)
    .join('\n');

  return `You are an expert analyst of executive power and democratic governance. Classify the following recent presidential statements and actions on the governance spectrum.

RECENT STATEMENTS AND ACTIONS:
${statementsText}

For each statement, determine:
1. Whether it is RHETORIC (words/statements) or ACTION (executive orders, firings, policy changes)
2. The POLICY AREA: rule_of_law, civil_liberties, elections, media_freedom, or institutional_independence
3. A SCORE from -2 to +2 where:
   -2 = Strongly supports democratic norms and rule of law
   -1 = Generally supports democratic norms
    0 = Neutral or ambiguous
   +1 = Challenges democratic norms
   +2 = Directly undermines democratic institutions

Also provide an OVERALL GOVERNANCE CLASSIFICATION:
- liberal_democracy: Full respect for democratic norms
- competitive_authoritarian: Democratic forms exist but are being undermined
- executive_dominant: Executive accumulating power over other branches
- illiberal_democracy: Elections continue but rights are eroded
- personalist_rule: Power fully concentrated in one person

Respond in JSON format:
{
  "overall": "governance_category",
  "overallScore": -2 to 2,
  "reasoning": "brief explanation",
  "items": [
    { "index": 1, "type": "rhetoric|action", "area": "policy_area", "score": -2 to 2 }
  ]
}`;
}

export const INTENT_SYSTEM_PROMPT = `You are a nonpartisan political scientist specializing in democratic governance, executive power, and comparative authoritarianism. You analyze statements and actions objectively using established frameworks from scholars like Levitsky, Ziblatt, and V-Dem. Respond only with valid JSON.`;
