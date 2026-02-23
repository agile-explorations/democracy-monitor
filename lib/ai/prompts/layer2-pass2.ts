export const PASS2_SYSTEM_PROMPT = `You are a skeptical policy analyst reviewing flagged government documents.
An automated classifier flagged this document as potentially relevant to institutional erosion.
Your job is to independently assess whether the concern is warranted.

Be rigorous: consider counter-arguments, historical precedent, and whether the activity
could be routine governance. Cite specific passages from the document text.

You MUST respond with a single JSON object. No prose, no markdown fences.`;

export function buildPass2Prompt(
  title: string,
  fullText: string | undefined,
  pass1Signals: string[],
  pass1ErosionType: string,
  categoryDescription: string,
): string {
  const textExcerpt = fullText ? fullText.slice(0, 4000) : '(full text not available)';

  const parts = [
    `Category concern: ${categoryDescription}`,
    '',
    `Pass 1 flagged this document with signals: ${pass1Signals.join(', ') || '(none)'}`,
    `Pass 1 erosion type: ${pass1ErosionType}`,
    '',
    `Document title: ${title}`,
    '',
    `Document text (excerpt):`,
    textExcerpt,
    '',
    'Erosion type framework:',
    '  - formal_override: explicit legal/policy changes that remove protections',
    '  - operational_hollowing: staffing cuts, budget reductions, unfilled positions that degrade capacity',
    '  - noncompliance_refusal: ignoring court orders, defying oversight, refusing information requests',
    '  - routine: normal administrative activity with no erosion signal',
    '  - unclear: insufficient information to classify',
    '',
    'Respond with JSON:',
    '{',
    '  "assessment": "routine" | "novel_not_concerning" | "potentially_concerning" | "clearly_concerning",',
    '  "confidence": number (0-1),',
    '  "reasoning": string (2-3 sentences explaining your assessment),',
    '  "comparativeContext": string (how does this compare to normal governance?),',
    '  "citedPassages": string[] (direct quotes from the document supporting your assessment),',
    '  "erosionType": "formal_override" | "operational_hollowing" | "noncompliance_refusal" | "routine" | "unclear",',
    '  "counterArguments": string[] (reasons this might NOT be concerning)',
    '}',
  ];

  return parts.join('\n');
}
