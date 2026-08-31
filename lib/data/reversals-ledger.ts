/**
 * The reversals ledger (#814): every time the site corrected, reversed, held,
 * or regenerated something it had published, with the date, the reason, and
 * where the evidence is. The charter's claim of neutrality is licensed by
 * this page, not by a sentence — a reader can check that the record changes
 * when it is wrong.
 *
 * Standing rule (PROJECT_KNOWLEDGE): a release that corrects, reverses,
 * holds, or regenerates anything adds an entry here before its tag. Newest
 * first. Numbers come from the linked record; where the record does not
 * state one, the entry carries none.
 */

export type ReversalKind = 'correction' | 'flip' | 'hold' | 'regeneration' | 'audit' | 'policy';

export interface ReversalEntry {
  /** YYYY-MM-DD */
  date: string;
  kind: ReversalKind;
  /** What part of the record: a category, a source, a page, an instrument. */
  scope: string;
  count?: number;
  /** What changed, in plain language. */
  what: string;
  /** Why — the cause, not the fix. */
  why: string;
  /** Issue or issue-comment URLs where the change is recorded. */
  evidence: string[];
  release?: string;
}

/** Reader-facing names for the kinds. */
export const REVERSAL_KIND_LABELS: Record<ReversalKind, string> = {
  correction: 'Correction',
  flip: 'Status changed after repair',
  hold: 'Publication held',
  regeneration: 'Regenerated',
  audit: 'Audit',
  policy: 'Policy',
};

const GH = 'https://github.com/agile-explorations/democracy-monitor';
const issue = (n: number, comment?: number) =>
  comment ? `${GH}/issues/${n}#issuecomment-${comment}` : `${GH}/issues/${n}`;
const decisions = `${GH}/blob/main/docs/DECISIONS.md`;
const decisionsArchive = `${GH}/blob/main/docs/DECISIONS-ARCHIVE.md`;

export const REVERSALS_LEDGER: ReversalEntry[] = [
  {
    date: '2026-08-31',
    kind: 'hold',
    scope: 'Weekly digest — week of 2026-08-24',
    what: 'The weekly digest email was held past its Monday send and released the same day, after repair.',
    why: 'The snapshot process was killed out of memory before the digest gate ran — and the gate would have held regardless: a late-archived 2024 GAO report had been scored into a baseline week whose aggregate had not been recomputed, one derivation-graph violation. The week was re-derived under the flip gate (zero status changes), validation came back clean, and the digest went out.',
    evidence: [issue(777)],
    release: 'v1.20.1',
  },
  {
    date: '2026-08-29',
    kind: 'policy',
    scope: 'Research answers — release gate',
    what: 'The v1.18 retrieval release was accepted with two eval questions one item lower than the baseline (FW2, IM4).',
    why: 'Both lost items were mentions of documents the retrieval had never returned in any run — the reordered pool stopped prompting them. No retrieved document was lost; the owner accepted the gate under its intent and the ledger records the choice.',
    evidence: [issue(804, 5464991977), issue(804, 5464984924)],
    release: 'v1.18.1',
  },
  {
    date: '2026-08-29',
    kind: 'regeneration',
    scope: 'Weekly narratives, January–August 2026',
    count: 42,
    what: '21 category narratives and 21 weekly summaries were regenerated; 2,030 older narratives were accepted as-is rather than regenerated.',
    why: 'The presidential-document backfill changed the status of 21 category-weeks, leaving narratives that said "no significant anomalies" beside weeks now at a departure status, and summaries whose category counts no longer matched the data.',
    evidence: [issue(798, 5462985409), issue(700, 5463607769)],
    release: 'v1.17.10',
  },
  {
    date: '2026-08-29',
    kind: 'flip',
    scope: 'Weekly statuses, January–June 2026',
    count: 21,
    what: 'Twenty-one category-week statuses moved up after the backfilled presidential documents were re-derived: elections (01-12, 02-02, 02-16, 03-09, 03-16, 03-30, 06-01, 06-08), civilService (01-19, 06-01), rulemaking (01-19, 02-09, 06-01), judicialIndependence (02-16, 03-30), lawEnforcement (03-30, 06-01), executiveActions (01-05), fiscal (02-09), military (03-30), mediaFreedom (04-13). All accepted.',
    why: 'Those weeks had held no presidential documents at all while the ingest was stalled; the documents that arrived — Executive Orders 14399 and 14410 among them — were classified as departures.',
    evidence: [issue(798, 5462985409), issue(798, 5460768587)],
    release: 'v1.17.8',
  },
  {
    date: '2026-08-28',
    kind: 'correction',
    scope: 'Ingest — Compilation of Presidential Documents',
    count: 1018,
    what: 'Presidential documents issued between 2026-01-07 and 2026-08-28 had never been ingested; 1,018 category rows were backfilled, embedded, and reviewed.',
    why: 'The publisher loads these documents about seven weeks after their issue date; the weekly step asked only for the previous week, found nothing, and logged that as success for seven months.',
    evidence: [issue(798), issue(798, 5460768587)],
    release: 'v1.17.8',
  },
  {
    date: '2026-08-28',
    kind: 'audit',
    scope: 'AI reviewer — political symmetry',
    count: 200,
    what: 'Two hundred current-term verdicts were re-run with the administrations’ names exchanged inside the documents: 11.6% crossed the departure line net of the model’s own noise (19 toward less concerning, 3 toward more). A mirror arm of 190 Biden-era documents renamed to the current administration moved 4.2%.',
    why: 'Verdict rates differ sharply by era; the audit tests whether that is the record or the reviewer. Reading: fragility of borderline verdicts to any renaming, not a party tilt — published on the methodology page.',
    evidence: [issue(772, 5456573721), issue(772, 5459191671), issue(772, 5459292438)],
    release: 'v1.17.3',
  },
  {
    date: '2026-08-28',
    kind: 'correction',
    scope: 'AI review annotations',
    count: 33,
    what: 'Thirty-three review annotations (18 current-term, 15 baseline-era) were corrected where the reviewer’s summary misstated what the document said.',
    why: 'A 400-row sampled audit screened the annotations against their documents; 33 of 100 flagged rows were confirmed substantive errors and rewritten from the document text, with the owner’s approval for the baseline rows.',
    evidence: [issue(711, 5456238704), issue(711, 5456238846)],
    release: 'v1.17.1',
  },
  {
    date: '2026-08-28',
    kind: 'correction',
    scope: 'Court opinions — revisions',
    count: 592,
    what: 'Five hundred ninety-two court-opinion rows that duplicated a revised version of the same opinion were marked superseded (never deleted) and dropped from counts; two weekly statuses moved down as a result (immigrationEnforcement 2026-04-06, lawEnforcement 2026-05-04), and seven moved up when emergency-docket orders were added.',
    why: 'CourtListener issues a second record when a slip opinion is revised; both had been counted. Emergency-docket orders had been excluded by the search default.',
    evidence: [issue(741, 5456439969), issue(741, 5459295191)],
    release: 'v1.17.2',
  },
  {
    date: '2026-08-28',
    kind: 'correction',
    scope: 'Overview — current week',
    count: 14,
    what: 'Fourteen aggregate rows for the week then in progress were deleted after a repair had created them.',
    why: 'The repair was run through the current date rather than the last completed week, so the overview showed a partial week as the latest.',
    evidence: [decisions],
    release: 'v1.17.3',
  },
  {
    date: '2026-08-28',
    kind: 'regeneration',
    scope: 'Weekly summaries 2026-07-20 and 2026-07-27',
    count: 2,
    what: 'Two stored weekly summaries were regenerated.',
    why: 'Each named a number of categories and then listed a different number (“Four categories” followed by six). A deterministic number check now runs on every summary before publication.',
    evidence: [issue(700, 5455368747), issue(700, 5455368945)],
    release: 'v1.17.1',
  },
  {
    date: '2026-08-21',
    kind: 'flip',
    scope: 'Baseline period — GAO reports',
    count: 1,
    what: 'One baseline-era weekly status changed when GAO reports were added back to 2017.',
    why: 'A new source is required to run uniformly across every period; the owner reviewed and accepted the single flip.',
    evidence: [issue(739), decisionsArchive],
    release: 'v1.15.1',
  },
  {
    date: '2026-08-11',
    kind: 'correction',
    scope: 'AI review annotations',
    count: 5,
    what: 'Five review annotations were corrected, beginning with one that said Executive Order 14029 “revokes Schedule F”.',
    why: 'Answer audits found annotations that misread their documents; the corrections were applied from the document text and the sampled audit at scale was scheduled.',
    evidence: [issue(711, 5258647945), issue(711, 5259216276)],
  },
  {
    date: '2026-08-10',
    kind: 'hold',
    scope: 'Weekly digest',
    what: 'The weekly digest was held and released by hand after the missing scores were computed (also on 2026-08-03).',
    why: 'Documents that their sources published late were stored outside the two-week scoring sweep and nothing scored them; the integrity check refused to send a digest built on unscored documents. The snapshot now reconciles unscored documents itself.',
    evidence: [issue(667), decisions],
  },
  {
    date: '2026-08-02',
    kind: 'flip',
    scope: 'Baseline periods — inspector-general reports (oversight.gov)',
    count: 31,
    what: 'Thirty-one baseline-era weekly statuses changed when reports from seven inspectors general were added across every period.',
    why: 'Uniform coverage across periods is required of every new source; the owner reviewed and accepted the flips.',
    evidence: [issue(655), decisionsArchive],
    release: 'v1.5.0',
  },
  {
    date: '2026-07-30',
    kind: 'flip',
    scope: 'Baseline periods — congressional hearing transcripts',
    count: 101,
    what: 'One hundred one baseline-era weekly statuses changed when hearing transcripts were added across every period.',
    why: 'Uniform coverage across periods; the owner reviewed the flips (for example, the 2018 family-separation week) and accepted them as mission-correct.',
    evidence: [decisionsArchive],
  },
  {
    date: '2026-07-15',
    kind: 'correction',
    scope: 'Press Freedom category',
    count: 67,
    what: 'Sixty-seven documents were dropped from the Press Freedom category by a relevance filter; a fresh holdout week showed no false drops.',
    why: 'Unrelated documents had been routed into the category and were contaminating its counts; the filter was adjudicated document by document (50 of 50 labels agreed) before it shipped.',
    evidence: [issue(543), issue(544), decisionsArchive],
  },
];

/** Entries per kind (all kinds present, zero when none). */
export function ledgerCounts(entries: ReversalEntry[]): Record<ReversalKind, number> {
  const counts: Record<ReversalKind, number> = {
    correction: 0,
    flip: 0,
    hold: 0,
    regeneration: 0,
    audit: 0,
    policy: 0,
  };
  for (const e of entries) counts[e.kind]++;
  return counts;
}
