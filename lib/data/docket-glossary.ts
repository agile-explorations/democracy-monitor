import type { DocketEventType } from '@/lib/services/docket-timeline';

/**
 * Plain-language explanations for docket-timeline display (#688 follow-up,
 * owner request 2026-08-09): event-type tips + a curated glossary of legal
 * terms of art matched against raw docket labels. Rendered as native title
 * tooltips, following the ASSESSMENT_TIPS / EROSION_TYPE_TIPS precedent in
 * DocumentTable.
 */

export const DOCKET_EVENT_TIPS: Record<DocketEventType, string> = {
  complaint: 'The filing that starts a case (or brings it to this court), stating the claims',
  answer: "A party's formal response to the claims against them",
  motion: 'A formal request asking the judge to decide or order something',
  order: "A judge's ruling on a motion or procedural matter",
  judgment: "The court's final decision resolving the case (or a claim in it)",
  appeal: 'A request for a higher court to review the decision',
  dismissal: 'The case (or a claim) being ended without a trial verdict',
  termination: 'The case being closed on the court docket',
  hearing: 'A scheduled court proceeding — argument, conference, or trial',
  other: 'A procedural docket event',
};

/**
 * Terms of art that commonly appear in docket-entry text, with plain-language
 * definitions. Matched case-insensitively as phrases; longest match wins when
 * phrases overlap (e.g. "summary judgment" before "judgment").
 */
export const DOCKET_TERM_GLOSSARY: ReadonlyArray<[string, string]> = [
  [
    'report and recommendation',
    "a magistrate judge's proposed ruling, which the district judge can adopt or reject",
  ],
  [
    'findings and recommendation',
    "a magistrate judge's proposed ruling, which the district judge can adopt or reject",
  ],
  ['preliminary injunction', 'a court order blocking an action while the case is decided'],
  [
    'temporary restraining order',
    'a short-term emergency order blocking an action, often before the other side responds',
  ],
  ['summary judgment', 'a ruling without trial because the key facts are not genuinely disputed'],
  ['default judgment', 'a win entered because the other side failed to respond or appear'],
  [
    'stipulation of dismissal',
    'the parties jointly agreeing to end the case, often after settlement',
  ],
  ['stipulation', 'an agreement between the parties'],
  ['per curiam', 'an unsigned ruling issued by the court as a whole rather than a named judge'],
  ['sua sponte', "on the court's own initiative, without a party requesting it"],
  ['in forma pauperis', 'permission to proceed without paying court fees due to inability to pay'],
  ['habeas corpus', "a challenge to the legality of someone's detention"],
  ['habeas', "a challenge to the legality of someone's detention"],
  ['mandamus', 'an order compelling a government official or lower court to perform a duty'],
  ['with prejudice', 'ended permanently — the claim cannot be refiled'],
  ['without prejudice', 'ended for now — the claim can be refiled'],
  ['remand', 'sending the case back to a lower court or agency'],
  ['vacate', 'canceling or setting aside a prior ruling'],
  ['pro se', 'a party representing themselves without a lawyer'],
  ['pro hac vice', 'a lawyer admitted for this case only'],
  ['amicus', 'a non-party offering the court information or argument ("friend of the court")'],
  ['show cause', 'an order requiring a party to explain why the court should not take an action'],
  ['voluntary dismissal', 'the filing party choosing to end its own case'],
  ['class certification', 'the ruling on whether the case may proceed on behalf of a whole group'],
  ['consent decree', 'a court-approved settlement the court can enforce'],
  ['scheduling order', 'the order setting the case timetable'],
  ['minute entry', "a clerk's brief record of a proceeding"],
  ['notice of appeal', 'the filing that starts an appeal'],
  ['certiorari', 'a request for the Supreme Court to hear the case'],
  ['en banc', 'heard by the full appeals court rather than a three-judge panel'],
  ['moot', 'no longer a live dispute the court can remedy'],
];

/**
 * Compose a plain-language tooltip for a docket label: the event-type tip plus
 * definitions of any glossary terms present. Longest-phrase-first matching so
 * "summary judgment" wins over "judgment"-adjacent phrasing (pure).
 */
export function explainDocketLabel(label: string, eventType: DocketEventType): string {
  const lower = label.toLowerCase();
  const matched: string[] = [];
  const covered: Array<[number, number]> = [];
  const sorted = [...DOCKET_TERM_GLOSSARY].sort((a, b) => b[0].length - a[0].length);
  for (const [term, definition] of sorted) {
    const idx = lower.indexOf(term);
    if (idx === -1) continue;
    if (covered.some(([s, e]) => idx < e && idx + term.length > s)) continue;
    covered.push([idx, idx + term.length]);
    matched.push(`"${term}": ${definition}`);
  }
  const parts = [DOCKET_EVENT_TIPS[eventType], ...matched];
  return parts.join(' · ');
}
