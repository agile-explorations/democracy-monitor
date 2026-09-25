/**
 * Congressional Record speaker turns (R-CREC-SPEAKERS #927).
 *
 * GovInfo's `members[]` for a granule is unordered and incomplete: on
 * CREC-2026-09-14-pt1-PgS4641 ("ELECTIONS") it omits Senator Schumer, who
 * opens the granule, and lists Senator Padilla first — so the document was
 * stored under Padilla. The Record text itself carries the turns ("Mr.
 * PADILLA.", "Ms. CANTWELL.", "The PRESIDING OFFICER."), flattened or not.
 * This module reads them so a granule is attributed to one member only when
 * exactly one member spoke, and so the splitter can cut per speech.
 *
 * Pure. Both regexes are unanchored: stored content has its newlines
 * collapsed, freshly fetched text keeps them.
 */

import type { CrecSpeaker } from './crec-fetcher';

export interface SpeakerTurn {
  /** Offset of the marker's first character. */
  at: number;
  /** The marker as printed, e.g. "Mr. PADILLA." or "The PRESIDING OFFICER." */
  marker: string;
  /** ALL-CAPS surname as printed ("VAN HOLLEN"); null for procedural turns. */
  surname: string | null;
  /** Presiding officer, clerk, chair — a turn that attributes to no member. */
  procedural: boolean;
}

export interface GranuleSpeakerAttribution {
  /** GovInfo display name ("Padilla, Alex") when exactly one member spoke, else null. */
  speaker: string | null;
  /** Several members listed, or several distinct speaker markers in the text. */
  ambiguous: boolean;
}

/** "Mr. PADILLA." / "Ms. CORTEZ MASTO." / "Mr. VAN HOLLEN." / "Mr. BROWN of Ohio." —
 *  the honorific, an ALL-CAPS surname of up to three words, an optional state
 *  disambiguator, a terminal period. "Mr. President." and "Mr. Speaker." fail the
 *  all-caps requirement by design. */
const SPEAKER_TURN_RE =
  /(?:^|\s)((?:Mr|Ms|Mrs|Miss)\. ([A-Z][A-Z'’-]+(?: [A-Z][A-Z'’-]+){0,2})(?: of [A-Z][a-z]+(?: [A-Z][a-z]+)?)?\.)(?=\s|$)/g;

/** Turns of the chair and staff: they structure the debate but attribute to no member. */
const PROCEDURAL_TURN_RE =
  /(?:^|\s)(The (?:PRESIDING OFFICER|ACTING PRESIDENT pro tempore|PRESIDENT pro tempore|SPEAKER pro tempore|SPEAKER|VICE PRESIDENT|CLERK|CHAIR|CHAIRMAN|CHAIRWOMAN)\.)(?=\s|$)/g;

function collect(text: string, re: RegExp, procedural: boolean): SpeakerTurn[] {
  const turns: SpeakerTurn[] = [];
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const at = m.index + m[0].indexOf(m[1]);
    turns.push({ at, marker: m[1], surname: procedural ? null : m[2], procedural });
  }
  return turns;
}

/** Every speaker turn in reading order. */
export function speakerTurns(text: string): SpeakerTurn[] {
  return [
    ...collect(text, SPEAKER_TURN_RE, false),
    ...collect(text, PROCEDURAL_TURN_RE, true),
  ].sort((a, b) => a.at - b.at);
}

/** Distinct member surnames that took a turn, in order of first appearance. */
export function distinctSpeakers(text: string): string[] {
  const seen = new Set<string>();
  for (const t of speakerTurns(text)) if (t.surname && !seen.has(t.surname)) seen.add(t.surname);
  return [...seen];
}

/** GovInfo prints "Padilla, Alex" / "Van Hollen, Chris" / "Durbin, Richard J." — the
 *  surname is everything before the comma. */
export function memberSurname(memberName: string): string {
  return memberName.split(',')[0].trim().toUpperCase();
}

const norm = (s: string) => s.toUpperCase().replace(/[’']/g, "'").trim();

/** The listed member a Record marker refers to, or null when GovInfo omitted them.
 *  The House prints a full name when two members share a surname ("Mr. RODNEY
 *  DAVIS.", "Ms. MICHELLE LUJAN GRISHAM."): the surname is then the marker's
 *  last one, two or three words and the leading word must open the member's
 *  given name ("Davis, Rodney"; "Lujan Grisham, Michelle"). */
export function resolveMember(marker: string, members: readonly CrecSpeaker[]): CrecSpeaker | null {
  const wanted = norm(marker);
  const exact = members.find((m) => norm(memberSurname(m.memberName)) === wanted);
  if (exact) return exact;
  const words = wanted.split(' ');
  for (let n = 1; n < words.length; n++) {
    const first = words.slice(0, n).join(' ');
    const surname = words.slice(n).join(' ');
    const hit = members.find((m) => {
      const [last, given = ''] = m.memberName.split(',').map((p) => norm(p));
      return last === surname && given.startsWith(first);
    });
    if (hit) return hit;
  }
  return null;
}

/** Several members listed, or several distinct member markers in the text. */
export function isMultiSpeaker(text: string, members: readonly CrecSpeaker[]): boolean {
  if (members.length > 1) return true;
  return distinctSpeakers(text).length > 1;
}

/** Attribute a granule to one member only when exactly one member spoke. */
export function resolveGranuleSpeaker(
  text: string | null | undefined,
  members: readonly CrecSpeaker[],
): GranuleSpeakerAttribution {
  if (isMultiSpeaker(text ?? '', members)) return { speaker: null, ambiguous: true };
  return { speaker: members[0]?.memberName ?? null, ambiguous: false };
}
