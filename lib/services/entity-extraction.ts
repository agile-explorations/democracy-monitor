/**
 * Entity-phrase extraction for corpus mining (#750) — the pure half of the
 * pseudo-relevance-feedback pipeline (see entity-mining.ts for the I/O).
 */

/** Chars of each candidate's content scanned for entity mentions. */
export const MINING_CONTENT_CHARS = 8000;
/** Candidate rows mined per build (both tiers pooled). */
export const MINING_CANDIDATE_LIMIT = 120;
/** Mined phrases forwarded to validation, ranked by document frequency. */
export const MAX_MINED_PHRASES = 8;
/** A phrase must appear in at least this many candidates to be salient —
 *  a caption seen once is usually the caption doc itself, already in the
 *  pool; entities the pool keeps discussing are the ones worth an arm. */
const MIN_DOC_FREQUENCY = 2;
const MIN_PHRASE_CHARS = 6;
const MAX_PHRASE_CHARS = 60;

/** A caption token is a dotted acronym (A.A.R.P., J.G.G., U.S.) or a plain
 *  capitalized word. Dots are confined to the acronym alternative so a
 *  sentence boundary ("...v. Trump. Cook...") can never be swallowed. */
const CAPTION_TOKEN = String.raw`(?:[A-Z]\.){2,}|[A-Z][A-Za-z'’-]+`;
/** Case captions: up to four tokens a side, "X v. Y" with optional period. */
const CAPTION_RE = new RegExp(
  String.raw`\b(?:${CAPTION_TOKEN})(?: (?:${CAPTION_TOKEN})){0,3} [vV]\.? (?:${CAPTION_TOKEN})(?: (?:${CAPTION_TOKEN})){0,3}`,
  'g',
);
/** Capitalized sentence words absorbed to the caption's left ("Following
 *  Newsom v. Trump") — stripped so spellings merge on the caption proper. */
const LEADING_CONNECTORS =
  /^(?:In|The|Following|See|After|Before|Under|But|And|Also|However|Both|With|From|As|On|At|By|For|To|That|This|When|While|Since|Like|Per|Of|Or|If|Compare|Contra|Unlike) /;
const EO_RE = /Executive Order \d{5}/g;
const OPERATION_RE = /Operation [A-Z][A-Za-z]+(?:['’][sS])?(?: [A-Z][A-Za-z]+){0,2}/g;
const PUBLIC_LAW_RE = /Public Law \d{2,3}-\d{1,4}/g;

/** Caption fragments that are not case names (list styles, OCR noise). */
const CAPTION_STOPWORDS = /\b(Chapter|Section|Article|Volume|Part|Title) v\.?/i;

/**
 * Extract candidate entity phrases from texts, ranked by how many texts
 * mention them (document frequency). Pure; exported for tests.
 */
export function extractEntityPhrases(texts: string[]): Array<{ phrase: string; docFreq: number }> {
  const freq = new Map<string, { phrase: string; docFreq: number }>();
  for (const text of texts) {
    const seen = new Set<string>();
    for (const re of [CAPTION_RE, EO_RE, OPERATION_RE, PUBLIC_LAW_RE]) {
      for (const m of text.matchAll(re)) {
        let phrase = m[0].replace(/\s+/g, ' ').trim();
        while (
          LEADING_CONNECTORS.test(phrase) &&
          / [vV]\.? /.test(phrase.replace(LEADING_CONNECTORS, ''))
        ) {
          phrase = phrase.replace(LEADING_CONNECTORS, '');
        }
        if (phrase.length < MIN_PHRASE_CHARS || phrase.length > MAX_PHRASE_CHARS) continue;
        if (CAPTION_STOPWORDS.test(phrase)) continue;
        const key = phrase.toLowerCase().replace(/ v\.? /, ' v. ');
        if (seen.has(key)) continue;
        seen.add(key);
        const entry = freq.get(key);
        if (entry) entry.docFreq++;
        else freq.set(key, { phrase, docFreq: 1 });
      }
    }
  }
  return [...freq.values()]
    .filter((e) => e.docFreq >= MIN_DOC_FREQUENCY)
    .sort((a, b) => b.docFreq - a.docFreq);
}
