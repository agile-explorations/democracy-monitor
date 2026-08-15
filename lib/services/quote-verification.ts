/**
 * Deterministic quote verification (#707): after synthesis, every quoted
 * span in the answer is string-matched against the FULL stored content of
 * its cited document — code, not prompts. A journalist checking a quote and
 * finding it fabricated is the most damaging failure class; this converts
 * it from prompt-discouraged to mechanically caught, on any question.
 *
 * A cited quote that misses its cited doc is re-checked against the other
 * context docs: a unique verbatim source becomes an auto-corrected citation
 * (disclosed in the badge, #720); several sources become a term-of-art note.
 * Pure text primitives live in quote-matching.ts.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import {
  ExtractedQuote,
  applyCitationCorrections,
  extractQuotedClaims,
  findNearestActual,
  isSearchedPhraseQuote,
  normalizeForMatch,
  quoteAppearsIn,
} from '@/lib/services/quote-matching';

/** A citation bracket the verifier rewrote (#720). `replaced`: the quote has
 *  exactly one verbatim source, which supplants the original citations.
 *  `expanded`: the quote appears in several non-cited documents — the bracket
 *  becomes the union (original kept for the claim it supports, verbatim
 *  sources added). */
export interface QuoteCorrection {
  quote: string;
  /** Citations the answer originally carried next to the quote. */
  from: number[];
  /** The document(s) that actually contain the quote verbatim. */
  to: number[];
  kind: 'replaced' | 'expanded';
}

export interface QuoteVerificationResult {
  totalQuotes: number;
  verifiedCount: number;
  /** Citations rewritten in `correctedAnswer` — disclosed in the badge (#720). */
  corrections?: QuoteCorrection[];
  /** The answer with corrected citation brackets, when corrections applied. */
  correctedAnswer?: string;
  unverified: Array<{
    quote: string;
    citations: number[];
    /** Citation index of a DIFFERENT context document that contains the
     *  quote verbatim — the quote is real but its citation points at the
     *  wrong document (#718). Set only when that document is unique. */
    foundIn?: number;
    /** Two or more non-cited context documents contain the quote — likely a
     *  term of art; the citation probably marks the claim's source (#720). */
    ambiguousIn?: number[];
    /** Nearest actual document text (raw), when the quote's opening words
     *  could be anchored in a cited document (#718). */
    nearest?: { citation: number; text: string };
  }>;
}

/** Verification haystacks per document. Titles join the haystack: answers
 *  legitimately quote document and hearing titles ("Restoring Independence:
 *  Rebuilding the Federal Offices of Inspectors General"), which
 *  content-only matching flagged (2026-08-14). */
function buildHaystacks(
  docRows: Array<{ id: number; title: string | null; content: string | null }>,
) {
  const rawById = new Map(
    docRows.map((r) => [Number(r.id), `${r.title ?? ''}. ${r.content ?? ''}`]),
  );
  const contentById = new Map(
    docRows.map((r) => [Number(r.id), normalizeForMatch(`${r.title ?? ''}. ${r.content ?? ''}`)]),
  );
  return { rawById, contentById };
}

/** Build one unverified entry with its nearest-actual, and log the miss
 *  (AI's version vs actual source text — owner request, 2026-08-14). When
 *  the quote was found verbatim in other context documents (#718/#720), the
 *  nearest-actual comes from one of THOSE — the badge can then say "wrong
 *  citation" or "term of art" instead of implying fabrication. */
function buildMiss(
  q: ExtractedQuote,
  containing: number[],
  idByCitation: Map<number, number>,
  rawById: Map<number, string>,
): QuoteVerificationResult['unverified'][number] {
  const foundIn = containing.length === 1 ? containing[0] : undefined;
  const ambiguousIn = containing.length > 1 ? containing : undefined;
  const nearest = findNearestActual(
    q.quote,
    containing.length > 0 ? containing : q.citations,
    idByCitation,
    rawById,
  );
  const foundNote =
    foundIn != null
      ? ` found verbatim in [Doc ${foundIn}] (wrong citation, unfixable bracket);`
      : ambiguousIn
        ? ` found in [Docs ${ambiguousIn.join(', ')}] (term of art);`
        : '';
  console.warn(
    `[quote-verification] MISS ai="${q.quote.slice(0, 160)}" cited=[${q.citations.join(',')}]${foundNote} actual: ${nearest ? `[Doc ${nearest.citation}] "${nearest.text.slice(0, 200)}"` : 'no nearby match for the opening words'}`,
  );
  return {
    quote: q.quote.slice(0, 200),
    citations: q.citations,
    ...(foundIn != null ? { foundIn } : {}),
    ...(ambiguousIn ? { ambiguousIn } : {}),
    ...(nearest ? { nearest: { ...nearest, text: nearest.text.slice(0, 300) } } : {}),
  };
}

/** ALL other context documents containing a missed quote (#718/#720): one
 *  hit means the quote is real but mis-cited (safe to correct); several mean
 *  a term of art whose citation likely marks the claim's source. Pure —
 *  unit-tested. */
export function findQuoteElsewhere(
  q: ExtractedQuote,
  docs: Array<{ citationIndex: number; id: number }>,
  contentById: Map<number, string>,
): number[] {
  const containing: number[] = [];
  for (const d of docs) {
    if (q.citations.includes(d.citationIndex)) continue;
    const content = contentById.get(d.id);
    if (content && quoteAppearsIn(q.quote, content)) containing.push(d.citationIndex);
  }
  return containing;
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

/** Quotes not found verbatim in any of their cited documents. */
function computeMissed(
  extracted: ExtractedQuote[],
  idByCitation: Map<number, number>,
  contentById: Map<number, string>,
): ExtractedQuote[] {
  return extracted.filter(
    (q) =>
      !q.citations.some((c) => {
        const id = idByCitation.get(c);
        const content = id != null ? contentById.get(id) : undefined;
        return content ? quoteAppearsIn(q.quote, content) : false;
      }),
  );
}

/** Split misses into bracket rewrites and unverified entries (#720): a
 *  unique verbatim source REPLACES the original citations; several sources
 *  EXPAND the bracket to the union (original kept — it may support the
 *  sentence's claim even though it lacks the quoted words). A bracket span
 *  is never rewritten twice — a second quote pairing to the same bracket
 *  stays unverified rather than conflict. */
function resolveMisses(
  missed: ExtractedQuote[],
  docs: Array<{ citationIndex: number; id: number }>,
  contentById: Map<number, string>,
  idByCitation: Map<number, number>,
  rawById: Map<number, string>,
) {
  const corrections: QuoteCorrection[] = [];
  const fixes: Array<{ span: { start: number; end: number }; docs: number[] }> = [];
  const usedSpans = new Set<number>();
  const unverified: QuoteVerificationResult['unverified'] = [];
  for (const q of missed) {
    const containing = findQuoteElsewhere(q, docs, contentById);
    const fixable =
      containing.length >= 1 && q.citationSpan != null && !usedSpans.has(q.citationSpan.start);
    if (fixable) {
      usedSpans.add(q.citationSpan!.start);
      const kind = containing.length === 1 ? 'replaced' : 'expanded';
      const bracketDocs = kind === 'replaced' ? containing : [...q.citations, ...containing];
      corrections.push({ quote: q.quote.slice(0, 200), from: q.citations, to: containing, kind });
      fixes.push({ span: q.citationSpan!, docs: bracketDocs });
      console.warn(
        `[quote-verification] ${kind.toUpperCase()} ai="${q.quote.slice(0, 160)}" cited=[${q.citations.join(',')}] -> [Doc ${bracketDocs.join(', Doc ')}] (verbatim in ${containing.join(',')})`,
      );
    } else {
      unverified.push(buildMiss(q, containing, idByCitation, rawById));
    }
  }
  return { corrections, fixes, unverified };
}

/** Fetch title+content haystacks for a set of document ids. */
async function loadHaystacks(db: ReturnType<typeof getDb>, ids: number[]) {
  const rows = await db.execute(sql`
    SELECT id, title, content FROM documents WHERE id IN (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )})`);
  return buildHaystacks(
    rows.rows as Array<{ id: number; title: string | null; content: string | null }>,
  );
}

/**
 * Verify every quoted span in the answer against stored document content.
 * `docs` maps citationIndex → documents.id. `searchedPhrases` are the
 * hybrid-retrieval chip terms — quotes of those are exempt (#718).
 * Failure-tolerant: a DB error returns null (verification unavailable),
 * never a false alarm.
 */
export async function verifyAnswerQuotes(
  answer: string,
  docs: Array<{ citationIndex: number; id: number }>,
  searchedPhrases: string[] = [],
): Promise<QuoteVerificationResult | null> {
  // Only quotes whose sentence carries a [Doc N] citation are verified: an
  // uncited quoted string is usually the model quoting terminology or
  // suggested search phrases, not a document — verifying those against
  // documents produced scary false alarms ("8 of 8 unverified", #712).
  const extracted = extractQuotedClaims(answer).filter(
    (q) => q.citations.length > 0 && !isSearchedPhraseQuote(q.quote, searchedPhrases),
  );
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
    const { rawById, contentById } = await loadHaystacks(db, [...neededIds]);
    const missed = computeMissed(extracted, idByCitation, contentById);
    // Found-elsewhere fallback (#718): only on a miss, load the REST of the
    // context docs and check whether the quote is real but mis-cited. The
    // extra fetch is bounded (≤ context size) and rare (misses only).
    if (missed.length > 0) {
      const remaining = docs.map((d) => d.id).filter((id) => !contentById.has(id));
      if (remaining.length > 0) {
        const extra = await loadHaystacks(db, remaining);
        extra.rawById.forEach((v, k) => rawById.set(k, v));
        extra.contentById.forEach((v, k) => contentById.set(k, v));
      }
    }
    const { corrections, fixes, unverified } = resolveMisses(
      missed,
      docs,
      contentById,
      idByCitation,
      rawById,
    );
    return {
      totalQuotes: extracted.length,
      verifiedCount: extracted.length - unverified.length,
      ...(corrections.length > 0
        ? { corrections, correctedAnswer: applyCitationCorrections(answer, fixes) }
        : {}),
      unverified,
    };
  } catch (err) {
    console.warn('[quote-verification] failed (verification unavailable):', err);
    return null;
  }
}
