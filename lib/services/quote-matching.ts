/**
 * Pure text primitives for deterministic quote verification (#707, split
 * from quote-verification.ts): quote extraction with citation pairing,
 * normalization, verbatim containment, nearest-actual location, and citation
 * rewriting. No I/O — everything here is unit-tested directly.
 */

import { CITATION_GROUP_PATTERN, parseDocCitations } from '@/lib/utils/citations';

/** Quotes shorter than this are too generic to verify meaningfully. */
const MIN_QUOTE_CHARS = 15;

export interface ExtractedQuote {
  quote: string;
  /** citationIndex values ([Doc N]) found in the quote's sentence. */
  citations: number[];
  /** Absolute span of the citation bracket in the answer, recorded only when
   *  the winning pairing window holds exactly one bracket group — the
   *  precondition for a safe citation rewrite (#720). */
  citationSpan?: { start: number; end: number };
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
      // Editorial insertions in sources ("[v]ocalize[d] support", "[the]
      // President", "[sic]"): keep the inserted letters, drop the brackets
      // and any [sic] — answers quote the readable form (2026-08-28).
      .replace(/\[sic\]/gi, '')
      .replace(/\[([^[\]]{1,40})\]/g, '$1')
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

/** Citation-pairing window on each side of a quote. */
const CITATION_WINDOW_CHARS = 250;

/** Sentence boundary: terminal punctuation, optional closers, whitespace,
 *  then a plausible sentence opener. Abbreviation false positives ("Mr.",
 *  "U.S.", "H.R. 8711") only SHORTEN a pairing window — a mild miss, never a
 *  false alarm — which is why sentence logic is safe here but was not safe
 *  for quote extraction itself (#718: splitting severed quote pairs). */
const SENTENCE_BOUNDARY = /[.!?][)\]"'’”]*\s+(?=[A-Z0-9"“])/g;

/** Truncate a left pairing window to text AFTER its last sentence boundary:
 *  a bracket in a PREVIOUS sentence belongs to that sentence's claim and
 *  must not be stolen by the next sentence's quote (#721). */
function afterLastSentenceEnd(text: string): { text: string; cut: number } {
  let cut = 0;
  for (const m of text.matchAll(SENTENCE_BOUNDARY)) cut = m.index! + m[0].length;
  return { text: text.slice(cut), cut };
}

/** Right pairing window: from the quote's end to the first sentence boundary
 *  OUTSIDE any quoted span (bounded by CITATION_WINDOW_CHARS). Crossing a
 *  sibling quote is deliberate — one sentence-final bracket legitimately
 *  covers '"A" and "B" [Doc 3]' (#721); crossing a sentence boundary is not,
 *  which is what made the old unbounded fallback dangerous (#718). */
function rightPairingWindow(
  answer: string,
  end: number,
  quoteSpans: Array<{ start: number; end: number }>,
): { offset: number; text: string } {
  const cap = Math.min(answer.length, end + CITATION_WINDOW_CHARS);
  let limit = cap;
  for (const m of answer.slice(end, cap).matchAll(SENTENCE_BOUNDARY)) {
    const abs = end + m.index!;
    if (quoteSpans.some((s) => abs >= s.start && abs < s.end)) continue;
    limit = abs + 1;
    break;
  }
  return { offset: end, text: answer.slice(end, limit) };
}

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
 *  same parity reason. Citation pairing is SENTENCE-SCOPED (#721): the
 *  right window runs to the quote's sentence end — past sibling quotes, so
 *  a sentence-final bracket covers '"A" and "B" [Doc 3]' — and the left
 *  window (citation-before-quote style) never reaches back past a sentence
 *  boundary, so a previous sentence's brackets are never stolen. No window
 *  ever crosses a sentence boundary — the failure mode of the removed
 *  unbounded fallback (#718). Pure — unit-tested. */
export function extractQuotedClaims(answer: string): ExtractedQuote[] {
  const results: ExtractedQuote[] = [];
  const matches = [...answer.matchAll(/[“"]([^“”"]{1,400}?)[”"]/g)];
  const quoteSpans = matches.map((m) => ({ start: m.index!, end: m.index! + m[0].length }));
  for (let k = 0; k < matches.length; k++) {
    const m = matches[k]!;
    const quote = m[1]!.trim();
    if (quote.length < MIN_QUOTE_CHARS) continue;
    const start = m.index!;
    const end = start + m[0].length;
    const prevBound = k > 0 ? matches[k - 1]!.index! + matches[k - 1]![0].length : 0;
    const right = rightPairingWindow(answer, end, quoteSpans);
    const leftStart = Math.max(prevBound, start - CITATION_WINDOW_CHARS);
    const rawLeft = answer.slice(leftStart, start);
    const trimmed = afterLastSentenceEnd(rawLeft);
    const left = { offset: leftStart + trimmed.cut, text: trimmed.text };
    const rightCitations = firstCitations(right.text);
    const leftCitations = rightCitations ? null : firstCitations(left.text);
    const window = rightCitations ? right : leftCitations ? left : null;
    results.push({
      quote,
      citations: rightCitations ?? leftCitations ?? [],
      ...bracketSpan(window, rightCitations ? 'right' : 'left'),
    });
  }
  return results;
}

/** Only punctuation/whitespace may sit between a quote and the bracket that
 *  is "adjacent" to it: `” [38]`, `,” [38]`, `[38] “…`. */
const ADJACENT_GAP = /^[\s,.;:)\]]*$/;

/** The absolute span of the citation bracket in a pairing window: the single
 *  bracket group when there is one, else the group ADJACENT to the quote
 *  (immediately after it in a right window, immediately before it in a left
 *  window) — the one the quote unambiguously pairs with. Any other
 *  multi-bracket layout yields no span, so a rewrite can never clobber a
 *  neighboring citation (#720; adjacency added 2026-08-28 after a verbatim
 *  "wrong citation" went uncorrected because the sentence held two brackets). */
function bracketSpan(
  window: { offset: number; text: string } | null,
  side: 'right' | 'left',
): { citationSpan: { start: number; end: number } } | Record<string, never> {
  if (!window) return {};
  const brackets = [...window.text.matchAll(CITATION_GROUP_PATTERN)];
  let m: RegExpMatchArray | undefined;
  if (brackets.length === 1) m = brackets[0];
  else if (brackets.length > 1) {
    const candidate = side === 'right' ? brackets[0]! : brackets[brackets.length - 1]!;
    const gap =
      side === 'right'
        ? window.text.slice(0, candidate.index!)
        : window.text.slice(candidate.index! + candidate[0].length);
    if (ADJACENT_GAP.test(gap)) m = candidate;
  }
  if (!m) return {};
  return {
    citationSpan: { start: window.offset + m.index!, end: window.offset + m.index! + m[0].length },
  };
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

/** Rewrite corrected citation brackets in the answer text — each span is
 *  replaced by a bracket listing `docs` (one for a replacement, several for
 *  a union expansion, #720). Spans are applied right-to-left so earlier
 *  indices stay valid. Pure — unit-tested. */
export function applyCitationCorrections(
  answer: string,
  fixes: Array<{ span: { start: number; end: number }; docs: number[] }>,
): string {
  let out = answer;
  for (const f of [...fixes].sort((a, b) => b.span.start - a.span.start)) {
    out = `${out.slice(0, f.span.start)}[Doc ${f.docs.join(', Doc ')}]${out.slice(f.span.end)}`;
  }
  return out;
}
