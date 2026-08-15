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
  unverified: Array<{
    quote: string;
    citations: number[];
    /** Citation index of a DIFFERENT context document that contains the
     *  quote verbatim — the quote is real but its citation points at the
     *  wrong document (#718). */
    foundIn?: number;
    /** Nearest actual document text (raw), when the quote's opening words
     *  could be anchored in a cited document (#718). */
    nearest?: { citation: number; text: string };
  }>;
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
      // Congressional Record page markers interrupt sentences mid-word in
      // stored text ("the explicit [[Page S3465]] authority") — never present
      // in quotes, so stripping is effectively haystack-side (2026-08-14).
      .replace(/\[\[Page [^\]]*\]\]/gi, ' ')
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

/** Citation-pairing window on each side of a quote, when no neighboring
 *  quote bounds it sooner. */
const CITATION_WINDOW_CHARS = 250;

/** Canonical form for searched-term exemption: normalized with boundary
 *  punctuation stripped, so `"Congressional Response,"` matches the chip
 *  phrase `Congressional Response`. */
function searchedPhraseKey(text: string): string {
  return normalizeForMatch(text).replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, '');
}

/** True when the quoted text is one of the hybrid-retrieval searched terms
 *  (#718): the coverage prompt invites the model to cite the searched terms
 *  and their counts, so a quoted chip with a [Doc N] in its pairing window
 *  is a false-alarm class, not a document misquote. Pure — unit-tested. */
export function isSearchedPhraseQuote(quote: string, searchedPhrases: string[]): boolean {
  const key = searchedPhraseKey(quote);
  return key.length > 0 && searchedPhrases.some((p) => searchedPhraseKey(p) === key);
}

/** parseDocCitations, but null on empty — for ??-chained window fallbacks. */
function firstCitations(text: string): number[] | null {
  const found = parseDocCitations(text);
  return found.length > 0 ? found : null;
}

/** Extract quoted spans (straight or curly) with the [Doc N] citations near
 *  them. Quotes are matched over the WHOLE answer — sentence-splitting
 *  before matching severed quote pairs at abbreviations ("...led to Mr.
 *  Trump's..." split inside the quotation), and the orphaned closing mark
 *  opened a phantom quote in the next fragment (#718, 2026-08-14). Every
 *  span is matched (even 1 char) and length-filtered afterwards for the
 *  same parity reason. Citations pair via a window bounded by neighboring
 *  quotes; a quote with none looks further right as a fallback (covers
 *  '"A" and "B" [Doc 3]'). Pure — unit-tested. */
export function extractQuotedClaims(answer: string): ExtractedQuote[] {
  const results: ExtractedQuote[] = [];
  const matches = [...answer.matchAll(/[“"]([^“”"]{1,400}?)[”"]/g)];
  for (let k = 0; k < matches.length; k++) {
    const m = matches[k]!;
    const quote = m[1]!.trim();
    if (quote.length < MIN_QUOTE_CHARS) continue;
    const start = m.index!;
    const end = start + m[0].length;
    const prevBound = k > 0 ? matches[k - 1]!.index! + matches[k - 1]![0].length : 0;
    const nextBound = k < matches.length - 1 ? matches[k + 1]!.index! : answer.length;
    // Right-biased pairing: citations nearly always FOLLOW their quote, so a
    // left-first window would steal the previous quote's trailing citation.
    // Bounded right first, bounded left second (citation-before-quote style).
    // NO unbounded fallback: reaching past a neighboring quote attributed
    // OTHER sentences' citations to quoted named entities ("One Big
    // Beautiful Bill"), flooding the badge with term-of-art false alarms
    // (first live run on this extractor, 2026-08-14). An unattributed quote
    // is exempt terminology — the pre-#718 disposition.
    const citations =
      firstCitations(answer.slice(end, Math.min(nextBound, end + CITATION_WINDOW_CHARS))) ??
      firstCitations(answer.slice(Math.max(prevBound, start - CITATION_WINDOW_CHARS), start)) ??
      [];
    results.push({ quote, citations });
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

/** Locate the nearest ACTUAL raw document text for a missed quote (#718):
 *  the quote's first words become a case-insensitive, whitespace/punctuation
 *  flexible pattern against the RAW content, so the surfaced window reads
 *  like the document (not the normalized matching form). Shown in the amber
 *  badge and logged, so tense-smoothing and dropped words ("abdicate" ->
 *  "abdicated", the dropped "only") are visible to users and in logs.
 *  Exported for tests. */
export function findNearestActual(
  quote: string,
  citations: number[],
  idByCitation: Map<number, number>,
  rawById: Map<number, string>,
): { citation: number; text: string } | null {
  const words = quote
    .split(/[^A-Za-z0-9()]+/)
    .filter((w) => w.length > 0)
    .slice(0, 6);
  if (words.length < 2) return null;
  // Sliding 3-word anchors over the opening words: anchoring only on the
  // FIRST words fails precisely when the first word is the drifted one
  // ("abdicated" vs the document's "abdicate") — a later trigram still lands.
  const anchors: string[][] = [];
  for (let o = 0; o + Math.min(3, words.length) <= words.length && o <= 3; o++) {
    anchors.push(words.slice(o, o + Math.min(3, words.length)));
  }
  for (const c of citations) {
    const id = idByCitation.get(c);
    const raw = id != null ? rawById.get(id) : undefined;
    if (!raw) continue;
    for (const anchor of anchors) {
      const pattern = new RegExp(
        anchor.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[^A-Za-z0-9]{1,6}'),
        'i',
      );
      const m = pattern.exec(raw);
      if (m) {
        const start = Math.max(0, m.index - 60);
        const text = raw
          .slice(start, m.index + quote.length + 80)
          .replace(/\s+/g, ' ')
          .trim();
        return { citation: c, text };
      }
    }
  }
  return null;
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
 *  the quote was found verbatim in a different context document (#718), the
 *  nearest-actual comes from THAT document — the badge can then say "wrong
 *  citation" instead of implying fabrication. */
function buildMiss(
  q: ExtractedQuote,
  foundIn: number | undefined,
  idByCitation: Map<number, number>,
  rawById: Map<number, string>,
): QuoteVerificationResult['unverified'][number] {
  const nearest = findNearestActual(
    q.quote,
    foundIn != null ? [foundIn] : q.citations,
    idByCitation,
    rawById,
  );
  const foundNote = foundIn != null ? ` found verbatim in [Doc ${foundIn}] (wrong citation);` : '';
  console.warn(
    `[quote-verification] MISS ai="${q.quote.slice(0, 160)}" cited=[${q.citations.join(',')}]${foundNote} actual: ${nearest ? `[Doc ${nearest.citation}] "${nearest.text.slice(0, 200)}"` : 'no nearby match for the opening words'}`,
  );
  return {
    quote: q.quote.slice(0, 200),
    citations: q.citations,
    ...(foundIn != null ? { foundIn } : {}),
    ...(nearest ? { nearest: { ...nearest, text: nearest.text.slice(0, 300) } } : {}),
  };
}

/** Search every OTHER context document for a missed quote (#718): a hit
 *  means the quote is real but attributed to the wrong [Doc N]. Pure —
 *  unit-tested. */
export function findQuoteElsewhere(
  q: ExtractedQuote,
  docs: Array<{ citationIndex: number; id: number }>,
  contentById: Map<number, string>,
): number | undefined {
  for (const d of docs) {
    if (q.citations.includes(d.citationIndex)) continue;
    const content = contentById.get(d.id);
    if (content && quoteAppearsIn(q.quote, content)) return d.citationIndex;
  }
  return undefined;
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
    const missed = extracted.filter(
      (q) =>
        !q.citations.some((c) => {
          const id = idByCitation.get(c);
          const content = id != null ? contentById.get(id) : undefined;
          return content ? quoteAppearsIn(q.quote, content) : false;
        }),
    );
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
    const unverified = missed.map((q) =>
      buildMiss(q, findQuoteElsewhere(q, docs, contentById), idByCitation, rawById),
    );
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
