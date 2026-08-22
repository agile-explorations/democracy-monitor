/**
 * Entity-phrase extraction for corpus mining — the pure half of the PRF
 * pipeline (#750) and of the offline hot-entity index (#757).
 *
 * Two configs serve two callers with different physics (#758):
 * - LIGHT: query-time PRF mining inside every research build. Bit-identical
 *   to the v1.10.1 shipped behavior (8k window, four regex classes,
 *   doc-frequency ≥ 2, slice-before-validate) — the widened settings ran in
 *   the common path once and destabilized prod (see #756 incident).
 * - WIDE: the weekly offline hot-entity sweep, where CPU is free. Adds
 *   named-statute and person-in-legal-context classes, single-mention
 *   eligibility, and a wide validation candidate list; precision is
 *   delegated to alias validation (match caps, stoplists).
 */

export interface ExtractionConfig {
  /** Chars of each candidate's content scanned (callers use for SQL LEFT()). */
  contentChars: number;
  /** Phrases kept per mine. */
  maxPhrases: number;
  /** Extracted phrases forwarded to validation. */
  validationCandidates: number;
  /** Minimum texts a phrase must appear in. */
  minDocFrequency: number;
  /** true = cap to maxPhrases BEFORE validation (v1.10.1 semantics). */
  sliceBeforeValidate: boolean;
  /** 'light' = captions/EOs/operations/public laws; 'enum' adds statutes
   *  (#762 query-time, enumeration builds only); 'wide' adds statutes +
   *  task forces + initiatives + persons (offline sweep). */
  classes: 'light' | 'enum' | 'wide';
}

/** v1.10.1 shipped query-time semantics — do not widen (#756 incident). */
export const LIGHT_EXTRACTION: ExtractionConfig = {
  contentChars: 8000,
  maxPhrases: 8,
  validationCandidates: 8,
  minDocFrequency: 2,
  sliceBeforeValidate: true,
  classes: 'light',
};

/** Enumeration-build mining (#762): LIGHT plus statutes, validate-then-
 *  slice (the slice-before-validate bug family stays dead), a few more
 *  phrases. Analytical builds keep LIGHT byte-identically. */
export const ENUM_EXTRACTION: ExtractionConfig = {
  contentChars: 8000,
  maxPhrases: 12,
  validationCandidates: 16,
  minDocFrequency: 2,
  sliceBeforeValidate: false,
  classes: 'enum',
};

/** Offline hot-entity sweep (#757): recall-first; validation filters. */
export const WIDE_EXTRACTION: ExtractionConfig = {
  contentChars: 20000,
  maxPhrases: 2000,
  validationCandidates: 4000,
  minDocFrequency: 2,
  sliceBeforeValidate: false,
  classes: 'wide',
};

/** Candidate rows mined per query-time build (both tiers pooled). */
export const MINING_CANDIDATE_LIMIT = 120;

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
/** Named statutes ("Alien Enemies Act", "Laken Riley Act of 2025") — WIDE only. */
const STATUTE_RE = /\b(?:[A-Z][A-Za-z'’-]+ ){1,4}Act(?: of \d{4})?\b/g;
/** Named task forces ("Memphis Safe Task Force") and initiatives ("Civil
 *  Rights Fraud Initiative") — WIDE only (#760). Same shape family as
 *  statutes: TitleCase words before a class noun, ≥3 words total. */
const TASK_FORCE_RE = /\b(?:[A-Z][A-Za-z'’-]+ ){1,4}Task Force\b/g;
const INITIATIVE_RE = /\b(?:[A-Z][A-Za-z'’-]+ ){1,4}Initiative\b/g;
/** Person names in legal-action context — WIDE only. Bare bigram extraction
 *  would flood; the keyword anchor keeps precision. */
const NAME = String.raw`[A-Z][a-z'’-]+ [A-Z][A-Za-z'’-]+`;
const LEGAL_ACTION = String.raw`indict\w*|prosecut\w*|convict\w*|acquitt\w*|charg(?:e[ds]?|ing)|sentenc\w*|pardon\w*|remov(?:al|ed|ing)|deport\w*|dismiss\w*|firing|fired|subpoena\w*|investigat\w*`;
const PERSON_CONTEXT_RE = new RegExp(
  String.raw`\b(?:${LEGAL_ACTION})\b[^.\n]{0,80}\b(${NAME})\b|\b(${NAME})\b[^.\n]{0,80}\b(?:${LEGAL_ACTION})\b`,
  'g',
);

/** Caption fragments that are not case names (list styles, OCR noise). */
const CAPTION_STOPWORDS = /\b(Chapter|Section|Article|Volume|Part|Title) v\.?/i;
/** Statute matches that are generic references or FR-preamble boilerplate
 *  (every rule recites the procedural cluster — their document frequency
 *  outranks the topical statutes the mining exists to find). */
const STATUTE_STOPWORDS =
  /^(?:The|This|That|Said|Such|An?|Any|Each|Every|No|Under|Whereas|Pursuant) |^(?:Administrative Procedure|National Defense Authorization|Paperwork Reduction|Congressional Review|Regulatory Flexibility|National Environmental Policy|Federal Advisory Committee|Government Paperwork Elimination|Small Business Regulatory Enforcement Fairness|Business Regulatory Enforcement Fairness)\b.*Act|^Unfunded Mandates Reform Act/i;
/** Person-context bigrams that are institutions, honorifics, or legal
 *  boilerplate nouns, not people ("The Court", "Federal Rule", "Civil
 *  Procedure" all matched the first sweep). */
const PERSON_STOPWORDS =
  /^(?:United States|White House|Supreme Court|District Court|Attorney General|Justice Department|Homeland Security|Federal Bureau|Grand Jury|New York|Los Angeles|El Salvador|District Judge|Chief Judge|President Trump|President Biden|Mr|Mrs|Ms|Dr)\b|^(?:The|This|That|Federal|Civil|Criminal|Judicial|National|Executive|Congressional) /i;

export type EntityClass =
  | 'caption'
  | 'statute'
  | 'eo'
  | 'operation'
  | 'public_law'
  | 'person'
  | 'task_force'
  | 'initiative';

export interface ExtractedPhrase {
  phrase: string;
  docFreq: number;
  entityClass: EntityClass;
}

const MIN_PHRASE_CHARS = 6;
const MAX_PHRASE_CHARS = 60;

function stripLeadingConnectors(phrase: string, guard: RegExp): string {
  let out = phrase;
  while (LEADING_CONNECTORS.test(out) && guard.test(out.replace(LEADING_CONNECTORS, ''))) {
    out = out.replace(LEADING_CONNECTORS, '');
  }
  return out;
}

function normalizePhrase(raw: string, kind: EntityClass): string | null {
  let phrase = raw.replace(/\s+/g, ' ').trim();
  if (kind === 'caption') phrase = stripLeadingConnectors(phrase, / [vV]\.? /);
  if (kind === 'statute' || kind === 'task_force' || kind === 'initiative') {
    const guard =
      kind === 'statute' ? / Act\b/ : kind === 'task_force' ? / Task Force\b/ : / Initiative\b/;
    phrase = stripLeadingConnectors(phrase, guard);
    if (STATUTE_STOPWORDS.test(phrase) || !/^[A-Z][a-z]/.test(phrase)) return null;
    if (phrase.split(' ').length < 3) return null; // one qualifier alone is too weak an arm
  }
  if (phrase.length < MIN_PHRASE_CHARS || phrase.length > MAX_PHRASE_CHARS) return null;
  if (kind === 'caption' && CAPTION_STOPWORDS.test(phrase)) return null;
  return phrase;
}

function collectMatches(
  text: string,
  classSet: ExtractionConfig['classes'],
  seen: Set<string>,
  bump: (key: string, phrase: string, entityClass: EntityClass) => void,
) {
  const wide = classSet === 'wide';
  const classes: Array<{ re: RegExp; kind: EntityClass }> = [
    { re: CAPTION_RE, kind: 'caption' },
    ...(classSet !== 'light' ? [{ re: STATUTE_RE, kind: 'statute' as const }] : []),
    ...(wide
      ? [
          { re: TASK_FORCE_RE, kind: 'task_force' as const },
          { re: INITIATIVE_RE, kind: 'initiative' as const },
        ]
      : []),
    { re: EO_RE, kind: 'eo' },
    { re: OPERATION_RE, kind: 'operation' },
    { re: PUBLIC_LAW_RE, kind: 'public_law' },
  ];
  for (const { re, kind } of classes) {
    for (const m of text.matchAll(re)) {
      const phrase = normalizePhrase(m[0], kind);
      if (!phrase) continue;
      const key = phrase.toLowerCase().replace(/ v\.? /, ' v. ');
      if (seen.has(key)) continue;
      seen.add(key);
      bump(key, phrase, kind);
    }
  }
  if (!wide) return;
  for (const m of text.matchAll(PERSON_CONTEXT_RE)) {
    const name = (m[1] ?? m[2] ?? '').replace(/\s+/g, ' ').trim();
    if (!name || name.length < MIN_PHRASE_CHARS || PERSON_STOPWORDS.test(name)) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    bump(key, name, 'person');
  }
}

/**
 * Extract candidate entity phrases from texts, ranked by how many texts
 * mention them (document frequency). Pure; exported for tests. An
 * accumulator can be threaded through repeated calls so batch sweeps never
 * hold all texts in memory (#757).
 */
export function extractEntityPhrases(
  texts: string[],
  config: ExtractionConfig = LIGHT_EXTRACTION,
  accumulator?: Map<string, ExtractedPhrase>,
): ExtractedPhrase[] {
  const freq = accumulator ?? new Map<string, ExtractedPhrase>();
  for (const text of texts) {
    const seen = new Set<string>();
    collectMatches(text, config.classes, seen, (key, phrase, entityClass) => {
      const entry = freq.get(key);
      if (entry) entry.docFreq++;
      else freq.set(key, { phrase, docFreq: 1, entityClass });
    });
  }
  return [...freq.values()]
    .filter((e) => e.docFreq >= config.minDocFrequency)
    .sort((a, b) => b.docFreq - a.docFreq);
}
