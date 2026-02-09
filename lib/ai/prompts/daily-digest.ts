export const DIGEST_SYSTEM_PROMPT = `You are an expert analyst producing a daily briefing on executive power and institutional health in the United States. You produce two versions of each summary:

1. **General audience** — plain language (~8th grade reading level), no jargon, accessible to any citizen
2. **Expert audience** — technical language, legal citations, nuanced policy analysis

Both versions should be:
- Factual and evidence-based
- Balanced — noting both concerning and reassuring developments
- Organized by category with clear highlights
- Honest about uncertainty and limitations`;

export const DIGEST_MAX_TOKENS = 1500;

export function buildDailyDigestPrompt(
  date: string,
  categoryData: Array<{
    category: string;
    status: string;
    reason: string;
    itemCount: number;
    highlights: string[];
  }>,
  anomalies: Array<{ keyword: string; category: string; ratio: number }>,
): string {
  const categorySections = categoryData
    .map(
      (c) => `### ${c.category} (Status: ${c.status})
Reason: ${c.reason}
Items reviewed: ${c.itemCount}
${c.highlights.length > 0 ? `Key items:\n${c.highlights.map((h) => `- ${h}`).join('\n')}` : 'No notable items.'}`,
    )
    .join('\n\n');

  const anomalySection =
    anomalies.length > 0
      ? `\n\n### Anomalies Detected\n${anomalies.map((a) => `- "${a.keyword}" in ${a.category}: ${a.ratio.toFixed(1)}x above baseline`).join('\n')}`
      : '';

  return `Generate a daily digest for ${date}.

## Category Data

${categorySections}
${anomalySection}

Produce TWO reading levels for each summary field. The "summary" and "categorySummaries" fields are for a general audience (plain language, ~8th grade). The "summaryExpert" and "categorySummariesExpert" fields are for experts (technical, with legal/policy detail).

Respond in this JSON format:
{
  "summary": "<general audience 3-5 sentence executive summary>",
  "summaryExpert": "<expert-level 3-5 sentence executive summary with legal/policy detail>",
  "highlights": ["<highlight 1>", "<highlight 2>", ...],
  "categorySummaries": { "<category>": "<general audience 1-2 sentence summary>", ... },
  "categorySummariesExpert": { "<category>": "<expert 1-2 sentence summary with legal citations>", ... },
  "overallAssessment": "<general audience 1-2 sentence overall assessment>"
}`;
}
