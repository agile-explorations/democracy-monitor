/**
 * Charter prose (#812, #813) — owner-verbatim. The 2026-08-17 charter on
 * /why-this-matters was approved sentence by sentence; the sections added on
 * 2026-08-29 (the apparatus inventory, "Why this stops at the record", the
 * renamed stance) follow the same rule: drafts here, the owner edits, what
 * ships is the owner's text. Lists inside the inventory render from the
 * instrument's own constants (categories, baselines, labels, models) and are
 * not prose.
 */

/** Methodology overview, both reading levels (one constant so they cannot diverge). */
export const STANCE_SENTENCE =
  'The stance behind every measurement here is a record kept in good repair, not a verdict: document the shift in how America governs itself, publish the lens it is seen through, and correct the record when it is wrong';

export const STANCE_TAIL =
  'The same instruments point at every administration; this page is where that claim is checkable.';

/** Replaces "This site exists to make that movement visible. Nothing more." */
export const VISIBLE_THROUGH_A_LENS =
  'This site exists to make that movement visible — through a lens we chose, describe below, and correct in public.';

export const APPARATUS_HEADING = 'What we decided before reading a single document';

export const APPARATUS_INTRO =
  'Every measurement on this site passes through choices we made first. We publish them so you can see through the lens — or around it.';

/** The six things decided first — one line each on the charter; the tables
 *  live on /system/lens (owner, 2026-08-29: "six short lines, then the link"). */
export const APPARATUS_LINES = [
  {
    lead: 'Fourteen categories',
    text: 'of institutional practice, chosen by us. A departure outside them is invisible here.',
  },
  {
    lead: 'A page of historical norms,',
    text: 'written by us, that says what "long-standing practice" means in each — this page.',
  },
  {
    lead: 'Eight baseline years',
    text: 'against which every departure is measured. There is no baseline before 2017.',
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
] as const;

export const APPARATUS_CLOSE = {
  lead: 'Each of these can be wrong;',
  link: 'the reversals ledger',
  tail: 'records when they were.',
  inventory: 'The full inventory — every model, every stored name, every prompt version —',
  inventoryLink: 'is its own page',
} as const;

export const STOPS_HEADING = 'Why this stops at the record';

/** Opens with the license, not the disclaimer (copy review, 2026-08-29). */
export const STOPS_LEAD =
  'Keeping the record is itself an act. Against a news cycle whose memory is measured in hours, the record is what stays.';

export const STOPS_PROOFS_INTRO = 'Our neutrality is licensed by conduct, not by claim:';

/** The five proofs — each one a link to where it can be checked. */
export const STOPS_PROOFS = [
  {
    text: 'the same instruments point at every administration',
    href: '/system/methodology#baselines',
  },
  {
    text: 'our reviewer is tested by swapping the administrations’ names inside the documents it reads',
    href: '/system/methodology#ai-document-review',
  },
  {
    text: 'its verdict rates are published for every era side by side',
    href: '/system/methodology#ai-document-review',
  },
  {
    text: 'fifty of its readings a quarter are set aside for readers who are not us — the first fifty are waiting for them now',
    href: '/system/methodology#reader-audit',
  },
  {
    text: 'when we are wrong we say so, on a page kept for that purpose',
    href: '/system/reversals',
  },
] as const;

export const STOPS_CLOSE =
  'What to do about what it shows belongs to the reader — to voters, and to the question the Constitution assigns to Congress, not to a website.';

/** The recurring phrase (methodology, charter, ledger header). */
export const GOOD_REPAIR_PHRASE = 'A record kept in good repair.';
export const LEDGER_TAGLINE = 'This page is the repair log.';
