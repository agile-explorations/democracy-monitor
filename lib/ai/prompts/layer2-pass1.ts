export const PASS1_SYSTEM_PROMPT = `You are a document classifier for a democracy monitoring system.
Your task is to determine whether a government document is relevant to concerns about
institutional erosion in a specific governance category.

You MUST respond with a single JSON object. No prose, no markdown fences.
Be conservative: flag documents only when they contain genuine signals of institutional change,
not routine administrative activity.`;

export function buildPass1Prompt(
  title: string,
  summary: string | undefined,
  docType: string,
  agency: string | undefined,
  pubDate: string | undefined,
  categoryDescription: string,
): string {
  const parts = [`Category concern: ${categoryDescription}`, '', 'Document:', `  Title: ${title}`];
  if (docType) parts.push(`  Type: ${docType}`);
  if (agency) parts.push(`  Agency: ${agency}`);
  if (pubDate) parts.push(`  Published: ${pubDate}`);
  if (summary) parts.push(`  Summary: ${summary.slice(0, 1000)}`);

  parts.push('');
  parts.push('Classify this document. Respond with JSON:');
  parts.push('{');
  parts.push('  "relevant": boolean (true if related to institutional erosion concerns),');
  parts.push('  "confidence": number (0-1),');
  parts.push('  "signals": string[] (brief phrases describing why it is relevant, empty if not),');
  parts.push(
    '  "erosionType": "formal_override" | "operational_hollowing" | "noncompliance_refusal" | "routine" | "unclear"',
  );
  parts.push('}');

  return parts.join('\n');
}
