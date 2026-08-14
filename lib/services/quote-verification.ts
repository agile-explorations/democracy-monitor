/**
 * Deterministic quote verification (#707): after synthesis, every quoted
 * span in the answer is string-matched against the FULL stored content of
 * its cited document — code, not prompts. A journalist checking a quote and
 * finding it fabricated is the most damaging failure class; this converts
 * it from prompt-discouraged to mechanically caught, on any question.
 *
 * Matching is verbatim after normalization (whitespace runs, curly quotes,
 * case). A quote with [Doc N] citations in its sentence is checked against
 * those documents; an uncited quote is checked against every context doc.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { parseDocCitations } from '@/lib/utils/citations';

/** Quotes shorter than this are too generic to verify meaningfully. */
const MIN_QUOTE_CHARS = 15;

export interface ExtractedQuote {
  quote: string;
  /** citationIndex values ([Doc N]) found in the quote's sentence. */
  citations: number[];
}

export interface QuoteVerificationResult {
  totalQuotes: number;
  verifiedCount: number;
  unverified: Array<{ quote: string; citations: number[] }>;
}

/** Normalize for matching: curly quotes/apostrophes, whitespace runs, case.
 *  Hyphen deletion absorbs line-break hyphenation artifacts in stored
 *  document text ("de- lineated" = "delineated"); citation collapse unifies
 *  statutory spellings ("287(g)" vs "287g") now that answers quote across
 *  both (#716). All transforms are symmetric on quote and source. */
export function normalizeForMatch(text: string): string {
  return (
    text
      // Quote characters are deleted (not normalized): documents nest quotes
      // ("so-called 'independent regulatory agencies'") that answers quote
      // without the inner marks; contractions stay symmetric (don't -> dont).
      .replace(/[‘’ʼ'“”"]/g, '')
      .replace(/[–—]/g, '-')
      .replace(/\[…\]|…|\.\.\./g, ' ')
      // Hyphens are deleted outright (not collapsed): stored text hyphenates
      // plain words at line breaks ("de- lineated" = "delineated"), which no
      // hyphen-preserving rule can distinguish from a real hyphen. Deletion is
      // symmetric on quote and source, so genuine hyphens still match.
      .replace(/\s*-\s*/g, '')
      .replace(/\b(\d+)\(([a-z])\)/gi, '$1$2')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase()
  );
}

/** Extract quoted spans (straight or curly) with the [Doc N] citations that
 *  appear in the same sentence. Pure — unit-tested. */
export function extractQuotedClaims(answer: string): ExtractedQuote[] {
  const results: ExtractedQuote[] = [];
  // Sentence-ish segmentation: quotes and citations usually cohabit one.
  const sentences = answer.split(/(?<=[.!?])\s+(?=[A-Z*\[#-])/);
  for (const sentence of sentences) {
    // Match EVERY quoted span (even 1 char) and length-filter afterwards:
    // a minimum inside the regex left short quotes ("last Friday")
    // unconsumed, flipping open/close parity so the prose BETWEEN two real
    // quotations was extracted as a phantom quote (#718, 2026-08-14).
    const quotes = [...sentence.matchAll(/[“"]([^“”"]{1,400}?)[”"]/g)]
      .map((m) => m[1].trim())
      .filter((q) => q.length >= MIN_QUOTE_CHARS);
    if (quotes.length === 0) continue;
    const citations = parseDocCitations(sentence);
    for (const quote of quotes) results.push({ quote, citations });
  }
  return results;
}

/** Ellipsis-tolerant containment: every ellipsis-separated fragment of the
 *  quote must appear in order in the source. Boundary punctuation is trimmed
 *  from fragments (American style tucks commas/periods INSIDE quotation
 *  marks — "efforts," must match a document that reads "efforts."); interior
 *  punctuation still matches verbatim. Pure — unit-tested. */
export function quoteAppearsIn(quote: string, normalizedSource: string): boolean {
  const fragments = quote
    .split(/\[…\]|…|\.\.\./)
    .map((f) => normalizeForMatch(f).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, ''))
    .filter((f) => f.length >= 8);
  if (fragments.length === 0) return true;
  let cursor = 0;
  for (const fragment of fragments) {
    const idx = normalizedSource.indexOf(fragment, cursor);
    if (idx === -1) return false;
    cursor = idx + fragment.length;
  }
  return true;
}

/** Document ids any extracted quote may need checking against. */
function collectNeededIds(
  extracted: ExtractedQuote[],
  docs: Array<{ citationIndex: number; id: number }>,
  idByCitation: Map<number, number>,
): Set<number> {
  const neededIds = new Set<number>();
  for (const q of extracted) {
    const targets = q.citations.length > 0 ? q.citations : docs.map((d) => d.citationIndex);
    for (const c of targets) {
      const id = idByCitation.get(c);
      if (id != null) neededIds.add(id);
    }
  }
  return neededIds;
}

/**
 * Verify every quoted span in the answer against stored document content.
 * `docs` maps citationIndex → documents.id. Failure-tolerant: a DB error
 * returns null (verification unavailable), never a false alarm.
 */
export async function verifyAnswerQuotes(
  answer: string,
  docs: Array<{ citationIndex: number; id: number }>,
): Promise<QuoteVerificationResult | null> {
  // Only quotes whose sentence carries a [Doc N] citation are verified: an
  // uncited quoted string is usually the model quoting terminology or
  // suggested search phrases, not a document — verifying those against
  // documents produced scary false alarms ("8 of 8 unverified", #712).
  const extracted = extractQuotedClaims(answer).filter((q) => q.citations.length > 0);
  if (extracted.length === 0) {
    return { totalQuotes: 0, verifiedCount: 0, unverified: [] };
  }
  if (!isDbAvailable()) return null;
  const db = getDb();
  const idByCitation = new Map(docs.map((d) => [d.citationIndex, d.id]));
  const neededIds = collectNeededIds(extracted, docs, idByCitation);
  if (neededIds.size === 0) {
    return { totalQuotes: extracted.length, verifiedCount: 0, unverified: [] };
  }
  try {
    const rows = await db.execute(sql`
      SELECT id, content FROM documents WHERE id IN (${sql.join(
        [...neededIds].map((i) => sql`${i}`),
        sql`, `,
      )})`);
    const contentById = new Map(
      (rows.rows as Array<{ id: number; content: string | null }>).map((r) => [
        Number(r.id),
        normalizeForMatch(r.content ?? ''),
      ]),
    );
    const unverified: QuoteVerificationResult['unverified'] = [];
    for (const q of extracted) {
      const targets = q.citations;
      const found = targets.some((c) => {
        const id = idByCitation.get(c);
        const content = id != null ? contentById.get(id) : undefined;
        return content ? quoteAppearsIn(q.quote, content) : false;
      });
      if (!found) unverified.push({ quote: q.quote.slice(0, 200), citations: q.citations });
    }
    return {
      totalQuotes: extracted.length,
      verifiedCount: extracted.length - unverified.length,
      unverified,
    };
  } catch (err) {
    console.warn('[quote-verification] failed (verification unavailable):', err);
    return null;
  }
}
