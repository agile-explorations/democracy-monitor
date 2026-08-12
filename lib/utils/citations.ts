/**
 * Doc-citation parsing shared by the answer renderer and the quote verifier
 * (#712): synthesis answers cite documents as [Doc 3], [Doc 2, Doc 4],
 * [Docs 1, 3, 5], or [Docs 19-21]. Everything downstream wants the numbers.
 */

/** Matches a whole citation bracket group in any of the observed forms. */
export const CITATION_GROUP_PATTERN = /\[Docs?\s[^\]]*\]/g;

/** All document numbers cited in a text fragment, in order, deduplicated. */
export function parseDocCitations(text: string): number[] {
  const numbers: number[] = [];
  for (const group of text.match(CITATION_GROUP_PATTERN) ?? []) {
    // Expand en-/em-dash and hyphen ranges ("Docs 19-21") before collecting.
    const expanded = group.replace(/(\d+)\s*[-–—]\s*(\d+)/g, (m, a, b) => {
      const start = parseInt(a, 10);
      const end = parseInt(b, 10);
      if (end <= start || end - start > 50) return m;
      return Array.from({ length: end - start + 1 }, (_, i) => String(start + i)).join(', ');
    });
    for (const n of expanded.match(/\d+/g) ?? []) {
      const num = parseInt(n, 10);
      if (!numbers.includes(num)) numbers.push(num);
    }
  }
  return numbers;
}
