/**
 * Charter prose (#812, #813) — owner-verbatim. The 2026-08-17 charter on
 * /charter (formerly on /why-this-matters) was approved sentence by sentence; the sections added on
 * 2026-08-29 (the apparatus inventory, "Why this stops at the record", the
 * renamed stance) follow the same rule: drafts here, the owner edits, what
 * ships is the owner's text. Lists inside the inventory render from the
 * instrument's own constants (categories, baselines, labels, models) and are
 * not prose.
 */

/** Methodology overview, both reading levels (one constant so they cannot diverge). */
export const STANCE_SENTENCE =
  'The stance here is a record kept in good repair, not a verdict. We document the shift, we publish';
export const STANCE_MID = 'it is seen through, and we correct the record when it is wrong.';

export const STANCE_TAIL =
  'The same instruments point at every administration — this page is where that claim is checkable, and';
export const STANCE_END = 'is where it has failed.';

/** Replaces "This site exists to make that movement visible. Nothing more." */
export const VISIBLE_THROUGH_A_LENS =
  'This site exists to make that movement visible — through a lens we built, publish below, and correct in public.';

export const APPARATUS_HEADING = 'What we decided before reading a single document';

export const APPARATUS_INTRO =
  'Every measurement on this site passes through choices we made first. We publish them so you can see through the lens — or around it.';

/** The six things decided first — one line each on the charter; the tables
 *  live on /system/lens (owner, 2026-08-29: "six short lines, then the link"). */
interface ApparatusLine {
  lead: string;
  text: string;
  /** Optional short link at the end (style rule: links carry the destination). */
  linkText?: string;
  href?: string;
}

export const APPARATUS_LINES: readonly ApparatusLine[] = [
  {
    lead: 'Fourteen categories',
    text: 'of institutional practice, chosen by us. A departure outside them is invisible here.',
  },
  {
    lead: 'A page of historical norms,',
    text: 'written by us, that says what "long-standing practice" means in each.',
    linkText: 'The norms',
    href: '/norms',
  },
  {
    lead: 'Eight baseline years',
    text: '— every year of the two preceding administrations — so the same reviewer’s rates can be compared era to era. There is no baseline before 2017.',
  },
  {
    lead: 'A two-pass reviewer.',
    text: 'Two companies’ models, on purpose; neither model’s priors are inspectable by us, and the instructions each receives are public.',
  },
  {
    lead: 'The words on the screen.',
    text: 'We say departure; the instrument’s stored names — concern, erosion — predate this page and remain in every export.',
  },
  {
    lead: 'Prose written by models,',
    text: 'checked by code for its numbers and quotations before anything is published.',
  },
];

export const APPARATUS_CLOSE = {
  lead: 'Each of these can be wrong;',
  link: 'the reversals ledger',
  tail: 'records when they were.',
  inventory: 'The full inventory — every model, every stored name, every prompt version —',
  inventoryLink: 'is its own page',
} as const;

export const STOPS_HEADING = 'Why this stops at the record';

/** The stopping point and the conduct list as two sections (editorial
 *  guidance, 2026-08-30): why the record is sufficient, then how the
 *  neutrality claim is checkable. */
export const STOPS_WHY =
  'Why keep watch at all, if we pass no judgment? Because some of what is changing took two and a half centuries to build and may not be rebuildable on any timeline that matters to the people alive now. A country is free to renovate its institutions. But renovation done quickly, without a record of what stood before, forecloses the option of changing course. This site is that record.';

export const STOPS_KEEPING =
  'Keeping it is itself the act. Against a news cycle whose memory is measured in hours, the record is what stays. What to do about what it shows belongs to the reader — to voters, and to the question the Constitution assigns to Congress, not to a website.';

export const CATCH_HEADING = 'How to catch us';

export const CATCH_INTRO = 'Neutrality is a claim anyone can make. Ours is licensed by conduct:';

/** Claim in plain text, short link at the end (style rule: links carry the
 *  destination, not the sentence). href 'READER_INVITE' resolves to the
 *  volunteer prefill at render time. */
export const CATCH_BULLETS = [
  {
    text: 'The same instruments point at every administration.',
    linkText: 'See the baselines',
    href: '/system/methodology#baselines',
  },
  {
    text: 'Our reviewer is tested by swapping the administrations’ names inside the documents it reads, and we publish what moves — including when it moves against us.',
    linkText: 'See the swap audit',
    href: '/system/self-tests#swap-audit',
  },
  {
    text: 'Its verdict rates are published for every era, side by side.',
    linkText: 'See the rates',
    href: '/system/self-tests#era-rates',
  },
  {
    text: 'Fifty of its readings a quarter go to readers who are not us. The first fifty are ready, and we are still looking for the readers.',
    linkText: 'Volunteer',
    href: 'READER_INVITE',
  },
  {
    text: 'The flags we raised under previous administrations are still published, unedited.',
    linkText: null,
    href: null,
  },
  {
    text: 'What this system cannot see is listed in our own words.',
    linkText: 'Limitations',
    href: '/system/methodology#limitations',
  },
  {
    text: 'When we are wrong, we say so — on a page kept for that purpose.',
    linkText: 'Reversals',
    href: '/system/reversals',
  },
] as const;

/** /system/self-tests (editorial guidance §3.2, 2026-08-30, #822): H1 and
 *  intro for the page holding the era rates, swap audit, and reader audit. */
export const SELF_TESTS_HEADING = 'What happens when we test ourselves';
export const SELF_TESTS_INTRO =
  'A reviewer that reads this administration’s documents more harshly than the last one’s is either detecting a real difference or expressing a preference. There is no way to settle that by argument, so we test it and publish what the tests return — including when they return something we would rather they didn’t.';

/** The recurring phrase (methodology, charter, ledger header). */
export const GOOD_REPAIR_PHRASE = 'A record kept in good repair.';
export const LEDGER_TAGLINE = 'This page is the repair log.';
