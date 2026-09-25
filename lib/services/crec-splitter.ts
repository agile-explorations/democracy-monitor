/**
 * CREC granule splitter (#704; composite topic × speaker since #929): breaks a
 * Congressional Record granule into per-topic units, then each topic into
 * per-speaker units when several members spoke. Two text modes:
 *
 * - structured: line-oriented text (freshly fetched, newlines preserved) —
 *   a heading is an ALL-CAPS line of 2+ words standing alone. High precision.
 * - flattened: stored document content (ingest normalization collapsed all
 *   whitespace) — headings are detected inline heuristically. Used to gauge
 *   whether stored text is splittable without re-fetching.
 *
 * The split criterion is structural (owner decision 2026-08-10, extended
 * 2026-09-24): a granule qualifies when it contains MORE THAN ONE leaf —
 * per-speech granules and single-topic, single-speaker transcripts are
 * untouched regardless of size. Speaker turns come from ./crec-speakers.
 */

import type { CrecSpeaker } from './crec-fetcher';
import { distinctSpeakers, resolveMember, speakerTurns } from './crec-speakers';

export interface GranuleUnit {
  /** Topic heading as printed in the Record (title case preserved as-is), or
   *  `${topic} — ${Surname}` for a speaker unit. */
  heading: string;
  /** Unit body text (a topic unit includes its heading line). */
  text: string;
  /** Speaker unit: the listed member who spoke; null when GovInfo omitted them
   *  (Schumer opening the ELECTIONS granule) or the segment precedes every turn. */
  speaker?: CrecSpeaker | null;
  /** Speaker unit: the surname as printed in the marker ("PADILLA"). */
  speakerSurname?: string;
}

/** A row the fragment build will write. */
export interface CompositeFragment extends GranuleUnit {
  /** '#frag-N' for a topic unit with one speaker, '#frag-N-sK' for a speaker child. */
  suffix: string;
  topicIndex: number;
  speakerIndex?: number;
  /** The topic unit was split by speaker — its stored '#frag-N' row is to be superseded. */
  splitBySpeaker: boolean;
  topicHeading: string;
}

/** Words that begin procedural headings we never want as standalone units. */
const PROCEDURAL_HEADING =
  /^(PRAYER|PLEDGE OF ALLEGIANCE|ADJOURNMENT|RECESS|EXECUTIVE SESSION|MORNING BUSINESS|LEGISLATIVE SESSION|PROGRAM|NOTICE|ANNOUNCEMENT)\b/;

const MIN_HEADING_CHARS = 10;
const MAX_HEADING_CHARS = 90;
/** Units shorter than this merge into the neighbouring unit (fragmentary). */
export const MIN_UNIT_CHARS = 500;

function isHeadingLine(line: string): boolean {
  const t = line.trim();
  if (t.length < MIN_HEADING_CHARS || t.length > MAX_HEADING_CHARS) return false;
  if (t !== t.toUpperCase()) return false;
  if (!/[A-Z]/.test(t)) return false;
  const words = t.split(/\s+/);
  if (words.length < 2) return false;
  // Reject lines that are mostly punctuation/numbers (tables, page refs)
  const letters = t.replace(/[^A-Z]/g, '').length;
  return letters >= t.length * 0.5;
}

/** Split structure-preserved granule text into topic units. */
export function splitStructuredGranule(text: string): GranuleUnit[] {
  const lines = text.split('\n');
  const boundaries: Array<{ line: number; heading: string }> = [];
  for (let i = 0; i < lines.length; i++) {
    if (isHeadingLine(lines[i])) boundaries.push({ line: i, heading: lines[i].trim() });
  }
  return assembleUnits(
    boundaries.map((b) => ({
      at: lines.slice(0, b.line).join('\n').length,
      heading: b.heading,
    })),
    text,
  );
}

/**
 * Inline heading detection for flattened text: an ALL-CAPS run of 3+ words
 * (18+ chars) immediately after a sentence boundary.
 */
const INLINE_HEADING =
  /(?:^|[.?!"'\]] )([A-Z][A-Z0-9'().,\-]*(?: [A-Z0-9&][A-Z0-9'().,\-]*){2,})(?= |$)/g;

/** Split flattened (single-line) granule text into topic units. */
export function splitFlattenedGranule(text: string): GranuleUnit[] {
  const boundaries: Array<{ at: number; heading: string }> = [];
  let m: RegExpExecArray | null;
  INLINE_HEADING.lastIndex = 0;
  while ((m = INLINE_HEADING.exec(text)) !== null) {
    const heading = m[1];
    if (heading.length < 18 || heading.length > MAX_HEADING_CHARS) continue;
    boundaries.push({ at: m.index + m[0].indexOf(heading), heading });
  }
  return assembleUnits(boundaries, text);
}

function assembleUnits(
  boundaries: Array<{ at: number; heading: string }>,
  text: string,
): GranuleUnit[] {
  const units: GranuleUnit[] = [];
  for (let i = 0; i < boundaries.length; i++) {
    const start = boundaries[i].at;
    const end = boundaries[i + 1]?.at ?? text.length;
    const heading = boundaries[i].heading;
    const body = text.slice(start, end).trim();
    if (PROCEDURAL_HEADING.test(heading)) continue;
    const prev = units[units.length - 1];
    if (body.length < MIN_UNIT_CHARS && prev) {
      prev.text += `\n${body}`;
      continue;
    }
    units.push({ heading, text: body });
  }
  return units;
}

/** Structural split criterion: does this granule contain multiple topic units? */
export function isMultiUnitGranule(units: GranuleUnit[]): boolean {
  return units.length > 1;
}

// --- speaker level (#929) ---

const titleCase = (surname: string) =>
  surname
    .toLowerCase()
    .split(/(\s|-|')/)
    .map((w) => (w.length > 1 ? w[0].toUpperCase() + w.slice(1) : w.toUpperCase()))
    .join('');

interface Segment {
  text: string;
  surname: string | null;
}

/** Cut a topic unit at every member turn; consecutive turns by one member stay together. */
function speakerSegments(text: string): Segment[] {
  const turns = speakerTurns(text).filter((t) => !t.procedural);
  if (turns.length === 0) return [{ text, surname: null }];
  const segments: Segment[] = [];
  const opening = text.slice(0, turns[0].at).trim();
  if (opening.length > 0) segments.push({ text: opening, surname: null });
  for (let i = 0; i < turns.length; i++) {
    const end = turns[i + 1]?.at ?? text.length;
    const body = text.slice(turns[i].at, end).trim();
    const prev = segments[segments.length - 1];
    if (prev && prev.surname === turns[i].surname) prev.text += `\n${body}`;
    else segments.push({ text: body, surname: turns[i].surname });
  }
  return segments;
}

/** Fragmentary segments join a neighbour: the previous one, or the next when first. */
function mergeShortSegments(segments: Segment[]): Segment[] {
  const out: Segment[] = [];
  let carry = '';
  for (const s of segments) {
    if (s.text.length < MIN_UNIT_CHARS) {
      const prev = out[out.length - 1];
      if (prev) prev.text += `\n${s.text}`;
      else carry += (carry ? '\n' : '') + s.text;
      continue;
    }
    out.push({ ...s, text: carry ? `${carry}\n${s.text}` : s.text });
    carry = '';
  }
  if (carry && out.length > 0) out[out.length - 1].text += `\n${carry}`;
  return out;
}

/** The one listed member no marker in the unit claims — the opening speaker
 *  GovInfo listed but the Record introduced without a marker. Decided over
 *  EVERY turn in the text (a short turn merged into a neighbour still claims
 *  its member). Null when zero or several remain. */
function unclaimedMember(unitText: string, members: readonly CrecSpeaker[]): CrecSpeaker | null {
  const claimed = new Set(
    distinctSpeakers(unitText)
      .map((s) => resolveMember(s, members)?.memberName)
      .filter(Boolean),
  );
  const rest = members.filter((m) => !claimed.has(m.memberName));
  return rest.length === 1 ? rest[0] : null;
}

/** One topic unit → its speaker units, or `[unit]` when one member spoke. */
export function splitUnitBySpeaker(
  unit: GranuleUnit,
  members: readonly CrecSpeaker[],
): GranuleUnit[] {
  const segments = mergeShortSegments(speakerSegments(unit.text));
  const surnames = [...new Set(segments.map((s) => s.surname).filter((s): s is string => !!s))];
  if (segments.length <= 1 || surnames.length === 0) return [unit];
  const opening = unclaimedMember(unit.text, members);
  return segments.map((s) => {
    const speaker = s.surname ? resolveMember(s.surname, members) : opening;
    const label = s.surname
      ? titleCase(speaker ? speaker.memberName.split(',')[0] : s.surname)
      : speaker
        ? titleCase(speaker.memberName.split(',')[0])
        : null;
    return {
      heading: label ? `${unit.heading} — ${label}` : unit.heading,
      text: s.text,
      speaker,
      speakerSurname: s.surname ?? undefined,
    };
  });
}

/** Text before the first recognised heading line. V1 dropped it (its units start
 *  at the first heading); the ELECTIONS granule's one-word heading is not a
 *  heading line at all, so its whole debate sat there. */
function leadingText(text: string, firstHeading: string): string {
  const lines = text.split('\n');
  const at = lines.findIndex((l) => l.trim() === firstHeading);
  return at > 0 ? lines.slice(0, at).join('\n').trim() : '';
}

type IndexedUnit = GranuleUnit & { index: number };

/** Topic units with V1 numbering (1..N over heading units, short ones included so
 *  stored '#frag-N' stay stable); text before the first heading is unit 0 under
 *  `fallbackHeading`; a granule without any heading line is one unit 1. */
function indexedTopicUnits(text: string, fallbackHeading: string): IndexedUnit[] {
  const topics = splitStructuredGranule(text);
  if (topics.length === 0) return [{ heading: fallbackHeading, text: text.trim(), index: 1 }];
  const lead = leadingText(text, topics[0].heading);
  const units: IndexedUnit[] = topics.map((u, i) => ({ ...u, index: i + 1 }));
  if (lead.length >= MIN_UNIT_CHARS)
    units.unshift({ heading: fallbackHeading, text: lead, index: 0 });
  return units;
}

function leavesOf(unit: IndexedUnit, members: readonly CrecSpeaker[]): CompositeFragment[] {
  const { index: _index, ...topicUnit } = unit;
  const children = splitUnitBySpeaker(topicUnit, members);
  if (children.length <= 1) {
    return [
      {
        ...topicUnit,
        suffix: `#frag-${unit.index}`,
        topicIndex: unit.index,
        splitBySpeaker: false,
        topicHeading: unit.heading,
      },
    ];
  }
  return children.map((c, k) => ({
    ...c,
    suffix: `#frag-${unit.index}-s${k + 1}`,
    topicIndex: unit.index,
    speakerIndex: k + 1,
    splitBySpeaker: true,
    topicHeading: unit.heading,
  }));
}

/** Composite split: topic units, then speaker children inside each. */
export function splitComposite(
  text: string,
  members: readonly CrecSpeaker[],
  fallbackHeading: string,
): CompositeFragment[] {
  const leaves: CompositeFragment[] = [];
  for (const unit of indexedTopicUnits(text, fallbackHeading)) {
    if (unit.text.length < MIN_UNIT_CHARS) continue;
    leaves.push(...leavesOf(unit, members));
  }
  return leaves;
}

/** Composite criterion: more than one leaf. */
export function qualifiesComposite(leaves: CompositeFragment[]): boolean {
  return leaves.length > 1;
}
