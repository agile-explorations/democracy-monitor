/**
 * Procedural CREC/congressional boilerplate title genres (#593). These
 * documents are calendars-of-business, not substance: their embeddings sit
 * near everything congressional, so they outrank real matches in research
 * retrieval (2026-07-28 testing: top-5 slots of the reclassification
 * question). Matched titles are rank-penalized, never excluded — a genuinely
 * strong match still surfaces.
 *
 * Deliberately conservative: genres that never carry argument or policy
 * substance. "STATEMENTS ON INTRODUCED BILLS" is excluded from the list —
 * those contain real member statements.
 */
export const PROCEDURAL_TITLE_GENRES = [
  'REPORTS OF COMMITTEES ON PUBLIC BILLS',
  'EXECUTIVE AND OTHER COMMUNICATIONS',
  'ADDITIONAL SPONSORS',
  'PETITIONS AND MEMORIALS',
  'MESSAGES FROM THE HOUSE',
  'MESSAGES FROM THE SENATE',
  'MESSAGES FROM THE PRESIDENT',
  'PROVIDING FOR CONSIDERATION OF THE BILL',
  'ENROLLED BILLS SIGNED',
  'EXECUTIVE REPORTS OF COMMITTEES',
  'INTRODUCTION OF BILLS AND JOINT RESOLUTIONS',
] as const;

/** Single case-insensitive alternation anchored at title start, for SQL ~* use. */
export const PROCEDURAL_TITLE_PATTERN = `^(${PROCEDURAL_TITLE_GENRES.join('|')})`;

/**
 * Rank penalty for procedural titles in the research combined score
 * (cosine 0.6 + recency 0.2 + keyword 0.2 scale): large enough to drop
 * boilerplate below substantive matches, small enough that an exceptional
 * cosine match still competes.
 */
export const PROCEDURAL_TITLE_PENALTY = 0.12;

/** TS twin of the SQL match, for tests and any in-memory ranking. */
export function isProceduralTitle(title: string): boolean {
  return new RegExp(PROCEDURAL_TITLE_PATTERN, 'i').test(title.trim());
}
