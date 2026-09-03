/**
 * Deterministic number discipline for weekly summaries (#700).
 *
 * The prompt tells the model to copy every count and document total verbatim
 * from the FACTUAL DATA block; the feedback pass asks a second model to
 * check that it did. Both are advisory. This module is the check as CODE:
 * every count claim in the text ("Six categories", "640 documents",
 * "from 498 to 640") must be a number the factual block actually contains,
 * and every enumerated list ("Four categories — A, B, C, D, E, F — are at
 * ConfirmedConcern") must have as many names as the count word says. Both
 * error classes shipped to subscribers before this existed (2026-08-03,
 * 2026-07-27).
 *
 * Pure: no I/O. The pipeline runs it after generation (one targeted revision,
 * then a digest hold); `narratives:verify` runs it over stored summaries.
 */

import { CATEGORIES } from '@/lib/data/categories';

export type NumberViolationKind = 'count' | 'comparison' | 'enumeration';

export interface NumberViolation {
  kind: NumberViolationKind;
  /** The figure as written. */
  raw: string;
  value: number;
  /** Short surrounding text for the hold reason / report. */
  context: string;
  /** Position of the figure in the (link-stripped) text. */
  index: number;
  /** Enumeration only: how many names the list actually holds. */
  listed?: number;
}

export interface CountCheckOptions {
  /** Number of monitored categories — "N of 14 categories" is a headline
   *  count (checked); "N of 7 elevated categories" is a subset the model
   *  counted itself (not a block figure, not checked). */
  categoryCount?: number;
}

export interface CountClaim {
  kind: 'count' | 'comparison';
  raw: string;
  value: number;
  /** Noun the number quantifies (categories/documents) when present. */
  noun: 'categories' | 'documents' | null;
  index: number;
}

const NUMBER_WORDS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
};

const NUMBER_WORD_ALT = Object.keys(NUMBER_WORDS).join('|');
const NUMBER_TOKEN = new RegExp(`\\b(\\d{1,3}(?:,\\d{3})+|\\d+|${NUMBER_WORD_ALT})\\b`, 'gi');
/** A hedged figure ("at least six", "over 1,200") is the model's own
 *  estimate, never a copied block figure — not a claim this check owns. */
const HEDGE_BEFORE =
  /\b(?:at least|about|nearly|roughly|approximately|more than|over|some|around|up to|as many as|fewer than|almost|only)\s*$/i;
/** A comparison must be about volume or status to be a block figure
 *  ("from 498 to 640 documents", not "from 30 to 10 days"). */
const COMPARISON_CONTEXT = /\b(?:document|volume|categor|elevated|concern|stable)/i;
const UNIT_AFTER =
  /^\s*(?:days?|hours?|years?|months?|weeks?|percent|%|pages?|dollars?|minutes?|miles?)\b/i;
const SENTENCE_WINDOW = 120;
/** "from 30 to 10 days": the unit sits after the SECOND figure. */
const PAIR_UNIT_AFTER =
  /^\s*to\s+[\d,]+\s*(?:days?|hours?|years?|months?|weeks?|percent|%|pages?|dollars?|minutes?|miles?)\b/i;
/** A category count is a block figure only when it is a STATUS statement
 *  ("7 categories are Elevated", "12 of 14 monitored categories"); "appears
 *  in six different categories" is the model counting its own narratives. */
const STATUS_CONTEXT =
  /\b(?:elevated|confirmedconcern|confirmed concern|stable|monitored|zero documents|no documents|highest concern|concern level|of 14)\b/i;
const ANALYTIC_QUALIFIER =
  /^\s*(?:of\s+(?:\d+|[a-z]+)\s+)?(?:[a-z-]+\s+)*?(?:different|separate|distinct|various|multiple|tracked|affected|re-elevated|de-escalated|activated|newly|additional|more|fewer|extra|other)\b/i;
/** "Seven categories moved upward": how many categories changed tier is the
 *  model's own tally over the two status lists, not a block figure. */
const MOVEMENT_AFTER_NOUN =
  /^\s*(?:\([^)]*\)\s*)?(?:that\s+|which\s+)?(?:moved|rose|fell|climbed|dropped|shifted|escalated|de-escalated|returned|improved|worsened|changed|went|flipped|transitioned)\b/i;
/** "an increase of 3 elevated categories", "up by 4": a week-over-week
 *  delta the model computed from two block figures — not itself in the block. */
const DELTA_BEFORE =
  /\b(?:increase|decrease|rise|drop|gain|loss|change|jump|decline|up|down)\s+(?:of|by)\s*$/i;
/** Up to two qualifiers between the number and its noun ("14 monitored
 *  categories"), optionally through an "of <M>" ("12 of 14 categories"). */
const COUNT_NOUN_AFTER = new RegExp(
  `^\\s*(?:of\\s+(\\d+|${NUMBER_WORD_ALT})\\s+)?(?:[a-z-]+\\s+){0,2}?(categor(?:y|ies)|documents?|docs)\\b`,
  'i',
);
const DEFAULT_CATEGORY_COUNT = CATEGORIES.length;
const COMPARISON_BEFORE = /\b(?:from|to)\s*$/i;
const MONTH_BEFORE =
  /\b(?:january|february|march|april|may|june|july|august|september|october|november|december)\s*$/i;
const YEAR_AFTER = /^\s*,\s*\d{4}\b/;
const CONTEXT_CHARS = 60;

/** Markdown links keep their text; URLs and doc ids inside them never count. */
function stripMarkdownLinks(text: string): string {
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1');
}

function parseNumber(raw: string): number {
  const word = NUMBER_WORDS[raw.toLowerCase()];
  return word ?? Number(raw.replace(/,/g, ''));
}

function isDateComponent(text: string, start: number, end: number): boolean {
  const before = text.slice(Math.max(0, start - 12), start);
  const after = text.slice(end, end + 8);
  const prev = text[start - 1];
  const next = text[end];
  // 2026-08-03, 08/03, 3.5 — number glued to punctuation-joined digits.
  if (prev && /[-/.\d]/.test(prev)) return true;
  if (next && /[-/.]/.test(next) && /\d/.test(text[end + 1] ?? '')) return true;
  return MONTH_BEFORE.test(before) || YEAR_AFTER.test(after);
}

function nounOf(word: string): 'categories' | 'documents' {
  return /^categor/i.test(word) ? 'categories' : 'documents';
}

/** Every count or volume-comparison claim in the text, in order. */
export function extractCountClaims(text: string, opts: CountCheckOptions = {}): CountClaim[] {
  const categoryCount = opts.categoryCount ?? DEFAULT_CATEGORY_COUNT;
  const clean = stripMarkdownLinks(text);
  const claims: CountClaim[] = [];
  for (const m of clean.matchAll(NUMBER_TOKEN)) {
    const raw = m[1];
    const start = m.index ?? 0;
    const end = start + raw.length;
    if (isDateComponent(clean, start, end)) continue;
    const after = clean.slice(end, end + 48);
    const before = clean.slice(Math.max(0, start - 24), start);
    if (HEDGE_BEFORE.test(before) || DELTA_BEFORE.test(before)) continue;
    const noun = COUNT_NOUN_AFTER.exec(after);
    if (noun) {
      // "five of seven elevated categories": a subset of a block figure the
      // model counted itself. Only "of <categoryCount>" is a headline count.
      if (noun[1] && parseNumber(noun[1]) !== categoryCount) continue;
      if (nounOf(noun[2]) === 'categories') {
        const sentence = clean.slice(Math.max(0, start - SENTENCE_WINDOW), end + SENTENCE_WINDOW);
        if (ANALYTIC_QUALIFIER.test(after) || !STATUS_CONTEXT.test(sentence)) continue;
        if (MOVEMENT_AFTER_NOUN.test(after.slice(noun[0].length))) continue;
      }
      claims.push({
        kind: 'count',
        raw,
        value: parseNumber(raw),
        noun: nounOf(noun[2]),
        index: start,
      });
      continue;
    }
    if (
      COMPARISON_BEFORE.test(before) &&
      /^\d/.test(raw) &&
      !UNIT_AFTER.test(after) &&
      !PAIR_UNIT_AFTER.test(after)
    ) {
      const sentence = clean.slice(Math.max(0, start - SENTENCE_WINDOW), end + SENTENCE_WINDOW);
      if (!COMPARISON_CONTEXT.test(sentence)) continue;
      claims.push({ kind: 'comparison', raw, value: parseNumber(raw), noun: null, index: start });
    }
  }
  return claims;
}

function contextAround(text: string, index: number, length: number): string {
  const clean = text;
  const from = Math.max(0, index - CONTEXT_CHARS);
  const to = Math.min(clean.length, index + length + CONTEXT_CHARS);
  return `${from > 0 ? '…' : ''}${clean.slice(from, to).replace(/\s+/g, ' ')}${to < clean.length ? '…' : ''}`;
}

/** Count claims whose figure is not in the allowed set (the FACTUAL block). */
export function checkNumbers(
  text: string,
  allowed: Set<number>,
  opts: CountCheckOptions = {},
): NumberViolation[] {
  const clean = stripMarkdownLinks(text);
  return extractCountClaims(clean, opts)
    .filter((c) => !allowed.has(c.value))
    .map((c) => ({
      kind: c.kind,
      raw: c.raw,
      value: c.value,
      index: c.index,
      context: contextAround(clean, c.index, c.raw.length),
    }));
}

const DEFAULT_TITLES = CATEGORIES.map((c) => c.title);

/** Enumeration head: "<N> [of <M>] [qualifiers] categories" followed within
 *  a few words by a list opener — no comma, clause break or "and" in between
 *  ("Nine categories are Stable, and two (A, B)" is two statements). The
 *  enumerated count is N: "3 of 14 monitored categories — A, B, C —". */
const ENUMERATION_HEAD = new RegExp(
  `\\b(\\d+|${NUMBER_WORD_ALT})\\s+(?:of\\s+(?:\\d+|${NUMBER_WORD_ALT})\\s+)?(?:[a-z-]+\\s+){0,3}?categories\\b(?:(?!\\band\\b)[^.\\n—–(:,;]){0,24}?\\s*(?:[—–]|\\(|:)\\s*`,
  'gi',
);
/** Where a dash- or colon-opened list ends: the closing dash, a sentence end
 *  (not an abbreviation's period — "Inside the U.S."), or the verb that
 *  follows the list. Parenthesized lists are closed by paren balancing so a
 *  title's own parenthetical ("Government Watchdogs (Inspectors General)")
 *  cannot end them early. */
const ENUMERATION_TAIL =
  /(?:[—–]|(?<![A-Z])\.(?:\s|$)|\s+(?:are|remain|were|is|stand|sit|had|have|show|showed|moved|produced)\b)/;
const ENUMERATION_SCAN_CHARS = 600;
const PARTIAL_LIST_OPENER =
  /^\s*(?:including|such as|among them|notably|for example|e\.g\.|led by)\b/i;

/** The list segment after an opener: balanced-paren for "(", tail regex otherwise. */
function listSegment(window: string, opener: string): string {
  if (opener !== '(') {
    const tail = ENUMERATION_TAIL.exec(window);
    return tail ? window.slice(0, tail.index) : window;
  }
  let depth = 1;
  for (let i = 0; i < window.length; i++) {
    if (window[i] === '(') depth++;
    else if (window[i] === ')' && --depth === 0) return window.slice(0, i);
  }
  return window;
}
/** A status breakdown inside a list: "2 at ConfirmedConcern (A, B) and 2 at
 *  Elevated (C, D)". The head count is then the sum of the parenthesized
 *  sub-lists, not the items of the breakdown itself. Each sub-list is closed
 *  by paren balancing so a title's own parenthetical ("Government Watchdogs
 *  (Inspectors General)") cannot end it early. Public summaries phrase the
 *  tiers as levels — "3 at the highest level (…) and 5 at an intermediate
 *  level (…)" — so an article + "… level" heads a sub-list too. */
const STATUS_SUBGROUP_HEAD = new RegExp(
  `\\b(?:\\d+|${NUMBER_WORD_ALT})\\s+(?:(?:remain(?:ing)?|are|still|now)\\s+)?(?:at|in)\\s+(?:confirmed ?concern|elevated|stable|(?:the|an?)\\s+(?:[a-z-]+\\s+){1,3}?level)\\b[^()]{0,40}?\\(`,
  'gi',
);

/** Sub-lists of a status breakdown, or [] when the segment has none. */
function statusSubgroups(segment: string): string[] {
  const subs: string[] = [];
  for (const m of segment.matchAll(STATUS_SUBGROUP_HEAD)) {
    const open = (m.index ?? 0) + m[0].length;
    subs.push(listSegment(segment.slice(open), '('));
  }
  return subs;
}
const TITLE_PLACEHOLDER = '§';

/** How many names a list segment holds. Known category titles are
 *  protected first (their own "and"s — "Free and Fair Elections" — must not
 *  split), then the remainder splits on commas and "and"; an item counts
 *  when it is a protected title or starts capitalized ("Elections",
 *  "Law Enforcement" — the model's short forms). */
export function countListItems(segment: string, titles: string[] = DEFAULT_TITLES): number {
  let protectedText = segment;
  for (const title of [...titles].sort((a, b) => b.length - a.length)) {
    const base = title.replace(/\s*\(.*\)\s*$/, '');
    protectedText = protectedText.split(base).join(TITLE_PLACEHOLDER);
  }
  return protectedText
    .split(/,\s*(?:and\s+)?|\s+and\s+/i)
    .map((item) => item.trim())
    .filter((item) => item.startsWith(TITLE_PLACEHOLDER) || /^[A-Z]/.test(item)).length;
}

/** How many distinct known category titles appear in a list segment. */
export function countCategoryTitles(segment: string, titles: string[] = DEFAULT_TITLES): number {
  const lower = segment.toLowerCase();
  let n = 0;
  for (const title of titles) {
    const base = title.replace(/\s*\(.*\)\s*$/, '').toLowerCase();
    if (lower.includes(base)) n++;
  }
  return n;
}

export interface Enumeration {
  index: number;
  raw: string;
  value: number;
  listed: number;
  context: string;
}

/** Every "<N> categories — A, B, C —" construction with the count word and
 *  the number of names actually listed. A consistent one grounds its own
 *  count (the list is the evidence), so the count is not held to the
 *  FACTUAL block; an inconsistent one is the definitive error class. */
export function findEnumerations(text: string, titles: string[] = DEFAULT_TITLES): Enumeration[] {
  const clean = stripMarkdownLinks(text);
  const found: Enumeration[] = [];
  for (const m of clean.matchAll(ENUMERATION_HEAD)) {
    const value = parseNumber(m[1]);
    const listStart = (m.index ?? 0) + m[0].length;
    const window = clean.slice(listStart, listStart + ENUMERATION_SCAN_CHARS);
    // "8 stable categories — including A, B —": a partial list by declaration.
    if (PARTIAL_LIST_OPENER.test(window)) continue;
    const segment = listSegment(window, m[0].trimEnd().slice(-1));
    // A list is a list only when at least two KNOWN titles anchor it; the
    // item count then tolerates the model's short forms.
    if (countCategoryTitles(segment, titles) < 2) continue;
    const subgroups = statusSubgroups(segment);
    const listed =
      subgroups.length > 0
        ? subgroups.reduce((sum, sub) => sum + countListItems(sub, titles), 0)
        : countListItems(segment, titles);
    if (listed >= 2) {
      found.push({
        index: m.index ?? 0,
        raw: m[1],
        value,
        listed,
        context: contextAround(clean, m.index ?? 0, m[0].length + segment.length),
      });
    }
  }
  return found;
}

/** Enumerations whose count word disagrees with the number of category
 *  names that follow it (the 2026-07-27 "Four categories — [six names]"). */
export function checkEnumerations(
  text: string,
  titles: string[] = DEFAULT_TITLES,
): NumberViolation[] {
  return findEnumerations(text, titles)
    .filter((e) => e.listed !== e.value)
    .map((e) => ({ kind: 'enumeration', ...e }));
}

/** Both checks over one narrative text. A count word that heads ANY
 *  enumeration is judged by its list, not the block: a bad one is reported
 *  once as the enumeration, a consistent one is grounded by its names. */
export function checkNarrativeNumbers(
  text: string,
  allowed: Set<number>,
  titles: string[] = DEFAULT_TITLES,
  opts: CountCheckOptions = {},
): NumberViolation[] {
  const enumerations = findEnumerations(text, titles);
  const heads = new Set(enumerations.map((e) => e.index));
  return [
    ...enumerations
      .filter((e) => e.listed !== e.value)
      .map((e) => ({ kind: 'enumeration' as const, ...e })),
    ...checkNumbers(text, allowed, opts).filter((v) => !heads.has(v.index)),
  ];
}

/** Human-readable line per violation, for feedback prompts and hold reasons. */
export function describeViolation(v: NumberViolation): string {
  if (v.kind === 'enumeration') {
    return `"${v.raw} categories" is followed by ${v.listed} category names — count and list disagree: ${v.context}`;
  }
  return `figure ${v.raw} does not appear in FACTUAL DATA (${v.kind}): ${v.context}`;
}

/** Every integer in a text, for building an allowed set from the factual block. */
export function integersIn(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/\d{1,3}(?:,\d{3})+|\d+/g)) out.add(Number(m[0].replace(/,/g, '')));
  return out;
}

/** The FACTUAL block's integers plus figures that are never "derived":
 *  years and the category count. Days of the month need no allowance —
 *  a date's day never carries a count noun, so it is never a claim. */
export function allowedNumbersFrom(factualBlock: string, categoryCount: number): Set<number> {
  const allowed = integersIn(factualBlock);
  for (let y = 2017; y <= 2035; y++) allowed.add(y);
  allowed.add(categoryCount);
  return allowed;
}
