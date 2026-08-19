/**
 * Entity-phrase extraction for corpus mining (#750, widened #753) — the pure
 * half of the pseudo-relevance-feedback pipeline (see entity-mining.ts for
 * the I/O).
 *
 * The R-DECOMP pre-deploy probe showed the original classes were too narrow:
 * the pool's own text mentioned "Alien Enemies Act", "Abrego Garcia", and
 * "Comey" while the extractor could only see "X v. Y" captions, EO numbers,
 * Operations, and Public Laws — and its doc-frequency-2 floor discarded
 * single-mention gold. Precision is delegated where it belongs: every mined
 * phrase still passes corpus validation (match caps, window share,
 * boilerplate stoplist) before becoming an arm, so extraction can afford
 * recall.
 */

/** Chars of each candidate's content scanned for entity mentions. */
export const MINING_CONTENT_CHARS = 20000;
/** Candidate rows mined per build (both tiers pooled). */
export const MINING_CANDIDATE_LIMIT = 120;
/** Mined phrases kept AFTER validation (#753 — validate wide, slice after). */
export const MAX_MINED_PHRASES = 12;
/** Extracted phrases forwarded to validation, ranked by document frequency.
 *  Wide enough that over-cap generic statutes cannot starve freq-1 gold. */
export const MINING_VALIDATION_CANDIDATES = 40;
/** Single mentions are eligible (#753): in a topically-tight pool a caption
 *  or statute seen once is often the only bridge to the case documents
 *  themselves; corpus validation filters what frequency used to. */
const MIN_DOC_FREQUENCY = 1;
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
/** Named statutes ("Alien Enemies Act", "Laken Riley Act of 2025"): 1-4
 *  TitleCase words before "Act". The leading-connector strip removes
 *  sentence-position artifacts ("This Act" never survives — one word). */
const STATUTE_RE = /\b(?:[A-Z][A-Za-z'’-]+ ){1,4}Act(?: of \d{4})?\b/g;
/** Person names in legal-action context ("the indictment of James Comey",
 *  "Abrego Garcia was removed"): a TitleCase bigram within 80 chars of a
 *  legal-action keyword, either order. Bare bigram extraction would flood;
 *  the keyword anchor keeps precision. */
const NAME = String.raw`[A-Z][a-z'’-]+ [A-Z][A-Za-z'’-]+`;
const LEGAL_ACTION = String.raw`indict\w*|prosecut\w*|convict\w*|acquitt\w*|charg(?:e[ds]?|ing)|sentenc\w*|pardon\w*|remov(?:al|ed|ing)|deport\w*|dismiss\w*|firing|fired|subpoena\w*|investigat\w*`;
const PERSON_CONTEXT_RE = new RegExp(
  String.raw`\b(?:${LEGAL_ACTION})\b[^.\n]{0,80}\b(${NAME})\b|\b(${NAME})\b[^.\n]{0,80}\b(?:${LEGAL_ACTION})\b`,
  'g',
);

/** Caption fragments that are not case names (list styles, OCR noise). */
const CAPTION_STOPWORDS = /\b(Chapter|Section|Article|Volume|Part|Title) v\.?/i;
/** Statute matches that are generic references or FR-preamble boilerplate
 *  (every rule recites the procedural cluster — Paperwork Reduction,
 *  Congressional Review, Regulatory Flexibility… — and their document
 *  frequency outranks the topical statutes the mining exists to find). */
const STATUTE_STOPWORDS =
  /^(?:The|This|That|Said|Such|An?|Any|Each|Every|No|Under|Whereas|Pursuant) |^(?:Administrative Procedure|National Defense Authorization|Paperwork Reduction|Congressional Review|Regulatory Flexibility|National Environmental Policy|Federal Advisory Committee|Government Paperwork Elimination|Small Business Regulatory Enforcement Fairness|Business Regulatory Enforcement Fairness)\b.*Act|^Unfunded Mandates Reform Act/i;
/** Person-context bigrams that are institutions or honorifics, not people. */
const PERSON_STOPWORDS =
  /^(?:United States|White House|Supreme Court|District Court|Attorney General|Justice Department|Homeland Security|Federal Bureau|Grand Jury|New York|Los Angeles|El Salvador|District Judge|Chief Judge|President Trump|President Biden|Mr|Mrs|Ms|Dr)\b/i;

interface ExtractedPhrase {
  phrase: string;
  docFreq: number;
}

function stripLeadingConnectors(phrase: string, guard: RegExp): string {
  let out = phrase;
  while (LEADING_CONNECTORS.test(out) && guard.test(out.replace(LEADING_CONNECTORS, ''))) {
    out = out.replace(LEADING_CONNECTORS, '');
  }
  return out;
}

function normalizePhrase(raw: string, kind: 'caption' | 'statute' | 'other'): string | null {
  let phrase = raw.replace(/\s+/g, ' ').trim();
  if (kind === 'caption') phrase = stripLeadingConnectors(phrase, / [vV]\.? /);
  if (kind === 'statute') {
    phrase = stripLeadingConnectors(phrase, / Act\b/);
    if (STATUTE_STOPWORDS.test(phrase) || !/^[A-Z][a-z]/.test(phrase)) return null;
    if (phrase.split(' ').length < 3) return null; // "Riley Act" alone is too weak an arm
  }
  if (phrase.length < MIN_PHRASE_CHARS || phrase.length > MAX_PHRASE_CHARS) return null;
  if (kind === 'caption' && CAPTION_STOPWORDS.test(phrase)) return null;
  return phrase;
}

function collectMatches(
  text: string,
  seen: Set<string>,
  bump: (key: string, phrase: string) => void,
) {
  const classes: Array<{ re: RegExp; kind: 'caption' | 'statute' | 'other' }> = [
    { re: CAPTION_RE, kind: 'caption' },
    { re: STATUTE_RE, kind: 'statute' },
    { re: EO_RE, kind: 'other' },
    { re: OPERATION_RE, kind: 'other' },
    { re: PUBLIC_LAW_RE, kind: 'other' },
  ];
  for (const { re, kind } of classes) {
    for (const m of text.matchAll(re)) {
      const phrase = normalizePhrase(m[0], kind);
      if (!phrase) continue;
      const key = phrase.toLowerCase().replace(/ v\.? /, ' v. ');
      if (seen.has(key)) continue;
      seen.add(key);
      bump(key, phrase);
    }
  }
  for (const m of text.matchAll(PERSON_CONTEXT_RE)) {
    const name = (m[1] ?? m[2] ?? '').replace(/\s+/g, ' ').trim();
    if (!name || name.length < MIN_PHRASE_CHARS || PERSON_STOPWORDS.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    bump(key, name);
  }
}

/**
 * Extract candidate entity phrases from texts, ranked by how many texts
 * mention them (document frequency). Pure; exported for tests.
 */
export function extractEntityPhrases(texts: string[]): ExtractedPhrase[] {
  const freq = new Map<string, ExtractedPhrase>();
  for (const text of texts) {
    const seen = new Set<string>();
    collectMatches(text, seen, (key, phrase) => {
      const entry = freq.get(key);
      if (entry) entry.docFreq++;
      else freq.set(key, { phrase, docFreq: 1 });
    });
  }
  return [...freq.values()]
    .filter((e) => e.docFreq >= MIN_DOC_FREQUENCY)
    .sort((a, b) => b.docFreq - a.docFreq);
}
