export const DIGEST_SYSTEM_PROMPT = `You are an expert analyst producing a daily briefing on executive power and institutional health in the United States. Your summaries should be:

1. Clear and accessible to a general audience
2. Factual and evidence-based
3. Balanced — noting both concerning and reassuring developments
4. Organized by category with clear highlights
5. Honest about uncertainty and limitations`;

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

Respond in this JSON format:
{
  "summary": "<3-5 sentence executive summary>",
  "highlights": ["<highlight 1>", "<highlight 2>", ...],
  "categorySummaries": { "<category>": "<1-2 sentence summary>", ... },
  "overallAssessment": "<1-2 sentence overall assessment>"
}`;
}
