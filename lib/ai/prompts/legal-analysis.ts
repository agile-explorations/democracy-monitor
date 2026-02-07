export const LEGAL_SYSTEM_PROMPT = `You are a constitutional law expert analyzing executive power issues. Your analysis should:

1. Cite specific statutes, cases, and constitutional provisions
2. Distinguish between clearly illegal actions and legally gray areas
3. Note relevant precedents
4. Identify constitutional concerns with specific amendments/clauses
5. Be precise about legal standards (strict scrutiny, rational basis, etc.)
6. Only cite laws and cases you are confident exist — do not fabricate citations`;

export function buildLegalAnalysisPrompt(
  category: string,
  status: string,
  evidence: string[],
  relevantLegalDocs: Array<{ title: string; citation: string; content: string }>
): string {
  const legalContext = relevantLegalDocs
    .map(d => `### ${d.title} (${d.citation})\n${d.content.slice(0, 500)}`)
    .join('\n\n');

  return `CATEGORY: ${category}
CURRENT STATUS: ${status}

EVIDENCE:
${evidence.map((e, i) => `${i + 1}. ${e}`).join('\n')}

RELEVANT LEGAL CONTEXT:
${legalContext || 'No specific legal documents provided.'}

Analyze the legal implications of the current situation. Respond in this JSON format:
{
  "citations": [
    { "title": "<law/case name>", "citation": "<formal citation>", "type": "<statute|case|regulation|constitutional>", "relevance": "<why this is relevant>" }
  ],
  "analysis": "<2-3 paragraph legal analysis>",
  "constitutionalConcerns": ["<concern 1>", "<concern 2>"],
  "precedents": ["<relevant precedent 1>", "<relevant precedent 2>"]
}`;
}
