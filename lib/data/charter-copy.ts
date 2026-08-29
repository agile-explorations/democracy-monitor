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
  'This site exists to make that movement visible — through a lens we describe below, and hold lightly.';

export const APPARATUS_HEADING = 'What we decided before reading a single document';

export const APPARATUS_INTRO =
  'Every measurement on this site passes through choices we made first. These choices are the lens. We publish the lens so you can see through it, or around it.';

export const APPARATUS_ITEMS = {
  categories: {
    lead: 'Fourteen categories',
    text: 'of institutional practice, chosen by us:',
    tail: 'A departure outside these fourteen is invisible here.',
  },
  norms: {
    lead: 'A page of historical norms,',
    text: 'written by us, that says what "long-standing practice" means in each — this page.',
  },
  baselines: {
    lead: 'Eight baseline years',
    text: 'against which every departure is measured:',
    tail: 'There is no baseline before 2017.',
  },
  reviewer: {
    lead: 'A two-pass reviewer.',
    text: 'A screening model flags documents; a reviewing model classifies each flagged document as one of four readings and names one of five mechanisms. Two companies’ models, on purpose. Neither model’s priors are inspectable by us; the instructions each receives are public.',
  },
  words: {
    lead: 'The words on the screen.',
    text: 'We say departure. The instrument’s stored names — concern for a departure, erosion for a mechanism — predate this page and remain in every export.',
  },
  prose: {
    lead: 'Prose written by models.',
    text: 'Weekly summaries and research answers are drafted and critiqued by the models below, then checked by code for their numbers and quotations before anything is published.',
  },
} as const;

export const APPARATUS_CLOSE = {
  lead: 'Each of these can be wrong.',
  link: 'The reversals ledger',
  tail: 'records when they were.',
} as const;

export const STOPS_HEADING = 'Why this stops at the record';

export const STOPS_PARAGRAPHS = [
  'This site stops at the record on purpose. What to do about what it shows belongs to the reader — to voters, and to the question the Constitution assigns to Congress, not to a website.',
  'Keeping the record is itself an act: against a news cycle whose memory is measured in hours, the record is what stays.',
  'And our neutrality is licensed by conduct, not by claim: the same instruments point at every administration; our reviewer is tested by swapping the administrations’ names inside the documents it reads; its verdict rates are published for every era side by side; fifty of its readings a quarter are read by people who are not us; and when we are wrong we say so, on a page kept for that purpose.',
] as const;
