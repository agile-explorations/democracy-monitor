/**
 * Trimmed CREC-2026-09-14-pt1-PgS4641 "ELECTIONS" (Senate, 2026-09-14), the
 * granule that motivated R-CREC-SPEAKERS (#927): Senator Schumer opens it
 * with no marker of his own, GovInfo's members list omits him and names
 * Padilla first, and four more senators follow under the one topic heading.
 * Schumer's and Padilla's passages are verbatim (shortened); the later turns
 * are abbreviated stand-ins long enough to survive MIN_UNIT_CHARS.
 *
 * Two forms: STRUCTURED (newlines preserved, as a fresh GovInfo fetch reads)
 * and FLATTENED (whitespace collapsed, as stored `documents.content` reads).
 */

import type { CrecSpeaker } from '@/lib/services/crec-fetcher';

const SCHUMER_OPENING = [
  "Madam President, on the DHS whistleblower, the news of which has just been made public, today, Americans get another whiff of Trump's scheme to rig the election. Today, Senator Padilla and I are revealing a bombshell whistleblower complaint about the Department of Homeland Security's effort to interfere in the upcoming election on Trump's behalf. The DHS whistleblower warns that the Department is pulling hundreds-- hundreds--of Federal agents from national security roles and sending them on a wild-goose chase.",
  "Apparently, agents are being commanded to violate State laws and lie to access private voter information and create law enforcement records as part of DHS's ``unlawful voter initiative.'' The whistleblower reports that innocent American citizens have been caught up in this effort to prove Trump's baseless voter fraud claims. Donald, end this illegal initiative now, and stop meddling in our elections. I yield the floor. I suggest the absence of a quorum.",
];

const PADILLA_TURN = [
  'Mr. PADILLA. Madam President, I ask unanimous consent that the order for the quorum call be rescinded.',
  'The PRESIDING OFFICER. Without objection, it is so ordered.',
  'Whistleblower Disclosure',
  "Mr. PADILLA. Madam President, as our colleagues know, I serve as ranking member of the Rules Committee, which oversees Federal elections. I also serve on the Judiciary Subcommittee on Border Security and Immigration. And [[Page S4642]] I reference this because last week, I received a protected disclosure from an anonymous Federal whistleblower. Today, Leader Schumer and I made the full disclosure public, and I am going to go over some of these highlights, which are incredibly disturbing. First, leadership at the Department of Homeland Security and the U.S. Citizenship and Immigration Services has ordered hundreds of employees in USCIS's Fraud Detection and National Security Division to stop doing the jobs they were hired and trained to do and instead watch a short training video and immediately turn their time and attention to something called the Unlawful Voter Initiative. They were directed to stop their anti-fraud work.",
];

const MURPHY_TURN =
  'Mr. MURPHY. Madam President, I thank the Senator from California for bringing this disclosure to the floor. What the whistleblower describes is not a policy dispute; it is an allegation that a Federal law enforcement workforce was redirected from its statutory mission to an election-year project, and that agents were told to misrepresent themselves to State election officials. If any part of that is true, the inspector general must open an investigation this week, and the Department must preserve every record. I would also note that the Committee on Appropriations funded that fraud-detection workforce for a purpose, and that purpose was not this.';

const CANTWELL_TURN =
  'Ms. CANTWELL. Madam President, I rise to add a point about State voter files. In my State, the Secretary of State runs a portal under State law with penalties for misuse, and the whistleblower account, if accurate, describes Federal employees using that portal under false pretenses. That is a matter for the Department to answer, and I have asked the Secretary to report to this body on how many records were accessed, from which States, and under what authority. Until those answers arrive, the Senate should treat the initiative as unauthorized. I yield the floor.';

const TUBERVILLE_TURN =
  'Mr. TUBERVILLE. Madam President, I rise on a different matter and ask unanimous consent that the Senate proceed to the consideration of the nomination on the Executive Calendar.';

export const ELECTIONS_MEMBERS: CrecSpeaker[] = [
  { memberName: 'Padilla, Alex', party: 'D', state: 'CA', chamber: 'S', bioGuideId: 'P000145' },
  { memberName: 'Murphy, Christopher', party: 'D', state: 'CT', chamber: 'S' },
  { memberName: 'Cantwell, Maria', party: 'D', state: 'WA', chamber: 'S' },
  { memberName: 'Tuberville, Tommy', party: 'R', state: 'AL', chamber: 'S' },
];

/** Members as GovInfo listed them for a single-speaker granule (Grassley control case). */
export const SINGLE_MEMBER: CrecSpeaker[] = [
  { memberName: 'Grassley, Chuck', party: 'R', state: 'IA', chamber: 'S' },
];

export const ELECTIONS_STRUCTURED = [
  'ELECTIONS',
  ...SCHUMER_OPENING,
  'The PRESIDING OFFICER. The clerk will call the roll.',
  'The senior assistant bill clerk proceeded to call the roll.',
  ...PADILLA_TURN,
  MURPHY_TURN,
  CANTWELL_TURN,
  TUBERVILLE_TURN,
].join('\n');

export const ELECTIONS_FLATTENED = ELECTIONS_STRUCTURED.replace(/\s+/g, ' ').trim();

/** A single-speaker granule in both forms. */
export const GRASSLEY_STRUCTURED = [
  'NOMINATION OF JOHN DOE',
  'Mr. GRASSLEY. Mr. President, I rise today to speak on the nomination before the Senate. The nominee has served the Judiciary Committee well and answered every question put to him in writing and in person, and I urge my colleagues to support his confirmation when the vote is called later today.',
].join('\n');
export const GRASSLEY_FLATTENED = GRASSLEY_STRUCTURED.replace(/\s+/g, ' ').trim();
