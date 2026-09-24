/**
 * Coverage search keys on a web index (R-TIPWIRE-5 #925).
 *
 * GDELT searched article full text, so every key was quoted and only
 * identifier-grade keys were worth asking. Brave ranks pages: a quoted report
 * or docket number matches only the pages that print it — the record itself,
 * which the host exclusion drops — while the judge's plain topic phrase,
 * unquoted and date-limited, returns the coverage. Unquoted queries always
 * return something, so their results pass a term-overlap gate on title and
 * description (read to filter, never stored). Measured 2026-09-24 (#925).
 */

import type { SearchHit } from './coverage-provider';

/** caption = "X v. Y" (quoted); code = a number-bearing identifier or figure
 *  (quoted, exact); phrase = the judge's topic wording (unquoted + gated). */
export type CoverageKeyKind = 'caption' | 'code' | 'phrase';

const KEY_MIN_CHARS = 4;
const KEY_MAX_CHARS = 80;
/** Document-collection ids (CREC/CHRG granules): nobody cites them in prose, so a
 *  zero is meaningless (spike 2026-09-24, #861). The judge prompt still emits them;
 *  its wording follows on the next prompt bump. */
const COLLECTION_ID_KEY = /^(CREC|CHRG)-\d{3}/i;
const CAPTION = /\bv\.?\s/i;
const YEAR = /^(19|20)\d{2}$/;
const MIN_TERM_CHARS = 3;
const MIN_PHRASE_WORDS = 3;
const MIN_PROPER_NAME_WORDS = 2;
const STOPWORDS = new Set([
  'the',
  'and',
  'for',
  'from',
  'with',
  'into',
  'over',
  'under',
  'that',
  'this',
  'are',
  'was',
  'were',
  'has',
  'have',
  'its',
  'per',
  'via',
  'not',
]);

const hasDigit = (t: string) => /\d/.test(t);

/** Lower-cased tokens worth matching: ≥3 chars, not a stopword, punctuation trimmed. */
export function significantTerms(key: string): string[] {
  return key
    .toLowerCase()
    .split(/[^a-z0-9.\-]+/)
    .map((t) => t.replace(/^[.-]+|[.-]+$/g, ''))
    .filter((t) => t.length >= MIN_TERM_CHARS && !STOPWORDS.has(t));
}

/** Which query shape a key gets, or null when no web index can answer it honestly. */
export function classifyKey(key: string): CoverageKeyKind | null {
  const k = key.trim();
  if (k.length < KEY_MIN_CHARS || k.length > KEY_MAX_CHARS) return null;
  if (COLLECTION_ID_KEY.test(k)) return null;
  if (CAPTION.test(k)) return 'caption';
  const terms = significantTerms(k);
  const words = terms.filter((t) => !hasDigit(t) || YEAR.test(t));
  // Any digit in the raw key ("39 of 73 cases" has none ≥3 chars) with too few words to rank.
  if (hasDigit(k) && words.length < MIN_PHRASE_WORDS) return 'code';
  if (words.length >= MIN_PHRASE_WORDS) return 'phrase';
  const capitalised = k.split(/\s+/).filter((t) => /^[A-Z][A-Za-z'’./&-]+$/.test(t));
  if (words.length >= MIN_PROPER_NAME_WORDS && capitalised.length >= MIN_PROPER_NAME_WORDS)
    return 'phrase';
  return null;
}

/** Captions and codes are exact strings coverage prints; phrases are ranked loosely. */
export function buildQuery(key: string, kind: CoverageKeyKind): string {
  const k = key.trim();
  return kind === 'phrase' ? k : `"${k.replace(/"/g, '')}"`;
}

/** For an unquoted phrase: every non-year number must appear in the title or
 *  description, and at least half of the words. Keeps "Report finds DHS
 *  whistleblower retaliation complaints have spiked", drops the Textile Research
 *  Journal that a bare "213" pulled in. */
export function passesTermGate(key: string, hit: SearchHit): boolean {
  const hay = `${hit.title ?? ''} ${hit.description ?? ''}`.toLowerCase();
  const terms = significantTerms(key);
  const numbers = terms.filter((t) => hasDigit(t) && !YEAR.test(t));
  const words = terms.filter((t) => !hasDigit(t) || YEAR.test(t));
  if (!numbers.every((n) => hay.includes(n))) return false;
  if (words.length === 0) return true;
  const need = Math.ceil(words.length / 2);
  return words.filter((w) => hay.includes(w)).length >= need;
}
