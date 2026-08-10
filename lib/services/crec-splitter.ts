/**
 * CREC granule splitter (#704): breaks a multi-topic Congressional Record
 * granule into per-topic units. Two modes:
 *
 * - structured: line-oriented text (freshly fetched, newlines preserved) —
 *   a heading is an ALL-CAPS line of 2+ words standing alone. High precision.
 * - flattened: stored document content (ingest normalization collapsed all
 *   whitespace) — headings are detected inline heuristically. Used to gauge
 *   whether stored text is splittable without re-fetching.
 *
 * The split criterion is structural (owner decision 2026-08-10): a granule
 * qualifies when it contains MORE THAN ONE unit — per-speech granules and
 * single-topic transcripts are untouched regardless of size.
 */

export interface GranuleUnit {
  /** Topic heading as printed in the Record (title case preserved as-is). */
  heading: string;
  /** Unit body text including the heading line. */
  text: string;
}

/** Words that begin procedural headings we never want as standalone units. */
const PROCEDURAL_HEADING =
  /^(PRAYER|PLEDGE OF ALLEGIANCE|ADJOURNMENT|RECESS|EXECUTIVE SESSION|MORNING BUSINESS|LEGISLATIVE SESSION|PROGRAM|NOTICE|ANNOUNCEMENT)\b/;

const MIN_HEADING_CHARS = 10;
const MAX_HEADING_CHARS = 90;
/** Units shorter than this merge into the preceding unit (fragmentary). */
const MIN_UNIT_CHARS = 500;

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

/** Structural split criterion: does this granule contain multiple units? */
export function isMultiUnitGranule(units: GranuleUnit[]): boolean {
  return units.length > 1;
}
