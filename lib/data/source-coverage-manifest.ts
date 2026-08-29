/**
 * Static source-coverage manifest for research synthesis prompts (#737).
 *
 * The corpus structurally cannot hold some document classes (OMB memoranda,
 * GAO reports). An answer that names such an absence reads as rigor; one
 * that is silent about it reads as ignorance to a reader who knows the
 * domain. Keep this list in sync with the fetchers actually wired in
 * production — a stale manifest is worse than none (the pre-#737 CLAUDE.md
 * GAO claim).
 */
export const SOURCE_COVERAGE_MANIFEST = [
  'Source coverage: the corpus ingests the Federal Register (rules, proposed rules,',
  'notices, presidential documents), federal court opinions (CourtListener), DOJ press',
  'releases, DHS/ICE/CBP newsroom releases, GovInfo (congressional reports, hearing',
  'transcripts, Congressional Record, public laws, Compilation of Presidential',
  'Documents), FEC filings, federal bills (LegiScan), federal OIG reports, and GAO',
  'reports and testimonies (highlights, via Internet Archive replay).',
  'NOT ingested: OMB/OPM memoranda (e.g. M-numbered directives), USCIS policy',
  'guidance (Policy Manual updates and policy memoranda, published only on uscis.gov),',
  'other agency guidance published only on agency websites, state and local government',
  'records, and news reporting. When a document type relevant to the question lives',
  'in a non-ingested class, say so by name — e.g. "OMB memoranda are not among',
  'ingested sources; that directive appears in this record through the litigation',
  'it triggered", or "USCIS policy memoranda are not among ingested sources; the',
  'denaturalization referral guidance appears in this record only through the',
  'litigation and press releases it produced" — rather than passing over it in silence.',
];
