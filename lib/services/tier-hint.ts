/**
 * Tier auto-hint (#596): when a question names a kind of document, suggest
 * the matching document-type toggle instead of silently overriding it —
 * the 287(g) floor-speech question returned 16 bills under the default
 * mixed retrieval. Deliberately conservative: phrases that unambiguously
 * name a tier. "Congressional responses" is NOT here (responses are often
 * bills, i.e. ACTION).
 */

export interface TierHint {
  tier: 'action' | 'discussion';
  /** The phrase that triggered the hint, for display. */
  phrase: string;
}

const DISCUSSION_PATTERNS: RegExp[] = [
  /floor (speech|statement|debate)s?/i,
  /spoke[n]? .{0,30}on the floor/i,
  /(congressional|senate|house) debates?/i,
  /remarks (on|about|by)/i,
  /(committee|congressional|oversight) hearings?/i,
  /hearing (transcript|testimony)/i,
  /testif(y|ied|ying)|witness(es)? told/i,
];

const ACTION_PATTERNS: RegExp[] = [
  /executive orders?/i,
  /presidential memorand(a|um)s?/i,
  /\bregulations?\b/i,
  /\brulemaking\b/i,
  /court (opinion|ruling|decision)s?/i,
  /press releases?/i,
];

export function suggestTierFromQuestion(question: string): TierHint | null {
  for (const re of DISCUSSION_PATTERNS) {
    const m = question.match(re);
    if (m) return { tier: 'discussion', phrase: m[0] };
  }
  for (const re of ACTION_PATTERNS) {
    const m = question.match(re);
    if (m) return { tier: 'action', phrase: m[0] };
  }
  return null;
}
