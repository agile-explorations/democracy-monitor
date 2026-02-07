import type { StatusLevel } from '@/lib/types';

export function buildAssessmentPrompt(
  category: string,
  categoryTitle: string,
  items: Array<{ title: string; summary?: string; agency?: string; pubDate?: string }>,
  keywordStatus: StatusLevel,
  keywordReason: string
): string {
  const itemSummaries = items
    .slice(0, 20)
    .map((item, i) => {
      const parts = [`${i + 1}. "${item.title}"`];
      if (item.agency) parts.push(`(${item.agency})`);
      if (item.pubDate) parts.push(`[${item.pubDate}]`);
      if (item.summary) parts.push(`— ${item.summary.slice(0, 200)}`);
      return parts.join(' ');
    })
    .join('\n');

  return `You are an expert analyst of U.S. democratic institutions and executive power. Assess the current state of "${categoryTitle}" based on these recent government documents.

CATEGORY: ${category}
KEYWORD-BASED ASSESSMENT: ${keywordStatus} — ${keywordReason}

RECENT DOCUMENTS:
${itemSummaries}

Analyze these documents and provide:
1. STATUS: One of [Stable, Warning, Drift, Capture]
   - Stable: Normal operations, checks and balances functioning
   - Warning: Some concerning patterns, but institutions pushing back
   - Drift: Multiple warning signs of power centralization
   - Capture: Serious violations of law, defiance of courts/oversight

2. CONFIDENCE: 0.0 to 1.0 (how confident you are in this assessment)

3. REASONING: 2-3 sentences explaining your assessment

4. EVIDENCE_FOR: Up to 3 specific items that support the concerning assessment (or that show things are working)

5. EVIDENCE_AGAINST: Up to 3 items that suggest things may not be as bad (or as good) as they appear

6. HOW_WE_COULD_BE_WRONG: 2-3 ways this assessment might be incorrect

Respond in JSON format matching this structure exactly:
{
  "status": "Stable|Warning|Drift|Capture",
  "confidence": 0.0-1.0,
  "reasoning": "...",
  "evidenceFor": ["item 1", "item 2"],
  "evidenceAgainst": ["item 1", "item 2"],
  "howWeCouldBeWrong": ["reason 1", "reason 2"]
}`;
}

export const ASSESSMENT_SYSTEM_PROMPT = `You are a nonpartisan analyst specializing in democratic institutions, rule of law, and executive power. You analyze government documents objectively, noting both concerning and reassuring patterns. You are careful not to overreact to routine government activity, but you take genuine threats to checks and balances seriously. Always provide balanced analysis with evidence on both sides. Respond only with valid JSON.`;
