/**
 * Court-scoped CourtListener query definitions (#528, #555).
 *
 * Shared by the CL API path (cl-opinion-first-fetcher) and the bulk-staging
 * SQL path (cl-bulk-staging) so both ingest the same court-scoped opinion
 * layer. Lives in lib/data because the two consumers import each other — a
 * leaf module breaks the cycle.
 */

/** CL search q for the first-amendment branch (mirrors the categories.ts signal). */
export const FIRST_AMENDMENT_QUERY =
  '"first amendment" AND (violation OR injunction OR challenge OR retaliation OR "free speech" OR "free press")';

/**
 * Executive-power phrases (#528). The NOS/first-amendment scope only surfaces
 * district civil-rights material; marquee appellate/SCOTUS executive-power
 * opinions (agency-head removal, birthright citizenship, Alien Enemies Act)
 * fall entirely outside it. OR-joined for the CL API q param; regex-alternated
 * for the bulk-SQL path — deriving both from this list keeps the paths in sync.
 */
export const EXEC_POWER_PHRASES = [
  'executive order',
  'presidential authority',
  'separation of powers',
  'impoundment',
  'unitary executive',
  'removal power',
] as const;

export const EXEC_POWER_QUERY = EXEC_POWER_PHRASES.map((p) =>
  p.includes(' ') ? `"${p}"` : p,
).join(' OR ');

/** All 13 federal circuit courts (CL court ids), space-separated for the court= param. */
export const CIRCUIT_COURT_IDS = 'ca1 ca2 ca3 ca4 ca5 ca6 ca7 ca8 ca9 ca10 ca11 cadc cafc';

/**
 * Court-scoped queries: every SCOTUS opinion, plus circuit and D.D.C. opinions
 * matching the executive-power query. Routed by content via
 * classifyOpinionToCategories (not NOS), gated — unrouted opinions are not
 * stored. The key doubles as the metadata.clQueries provenance marker.
 * Volumes verified 2026-07-08 (T2: 207 + 401 + 268 ≈ 12/week).
 */
export const COURT_QUERIES: ReadonlyArray<{ key: string; court: string; query?: string }> = [
  { key: 'scotus-all', court: 'scotus' },
  { key: 'circuits-exec', court: CIRCUIT_COURT_IDS, query: EXEC_POWER_QUERY },
  { key: 'dcd-exec', court: 'dcd', query: EXEC_POWER_QUERY },
];

/**
 * Court-NAME classification (#587). Documents store the human-readable court
 * name in the agency field ('Court of Appeals for the Ninth Circuit'), not
 * the CL id ('ca9') — these patterns map stored names onto the query scopes
 * above. Verified against all stored variants 2026-07-28: SCOTUS is exactly
 * one string; federal circuits all match 'Court of Appeals for the … Circuit'
 * (state appellate courts — 'Ohio Court of Appeals', 'Texas Court of Appeals,
 * 15th District', 'District of Columbia Court of Appeals' — never do).
 */
export const SCOTUS_COURT_NAME = 'Supreme Court of the United States';
export const FEDERAL_CIRCUIT_NAME_PATTERN = /^Court of Appeals for the .+ Circuit$/;
export const DCD_COURT_NAME = 'District Court, District of Columbia';

export type CourtScopeClass = 'scotus' | 'circuit' | 'dcd' | 'other';

export function classifyCourtName(courtName: string | null | undefined): CourtScopeClass {
  if (!courtName) return 'other';
  const name = courtName.trim();
  if (name === SCOTUS_COURT_NAME) return 'scotus';
  if (FEDERAL_CIRCUIT_NAME_PATTERN.test(name)) return 'circuit';
  if (name === DCD_COURT_NAME) return 'dcd';
  return 'other';
}
