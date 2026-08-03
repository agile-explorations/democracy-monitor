/**
 * Counting-scope classifier for court-category opinions (#587).
 *
 * The Feb 2026 collection rework moved CL ingestion to the court-scoped
 * opinion layer (court-queries.ts): every SCOTUS opinion, plus circuit and
 * D.D.C. opinions matching the executive-power phrases. The legacy NOS-docket
 * and first-amendment-search streams stopped delivering by April 2026 —
 * validation (2026-07, prod) showed both at zero while the court-queries
 * layer stayed steady across every seam. The counting population therefore
 * mirrors ONLY the court-queries layer.
 *
 * History cannot be re-collected, but the criteria are local: we store every
 * opinion's court name and full text. Applying THIS classifier uniformly to
 * all eras makes the counting series method-consistent BY CONSTRUCTION;
 * fidelity to CL's search analyzer is irrelevant because both sides of every
 * seam are measured by the same rule. Out-of-scope documents stay stored and
 * remain L2 assessment evidence — this flag governs counting only.
 *
 * v1 (2026-07). The classifier is part of the public data dictionary — bump
 * the version and re-derive if the rule ever changes.
 */

import { classifyCourtName, EXEC_POWER_PHRASES } from '@/lib/data/court-queries';
import type { ContentItem } from '@/lib/types/assessment';

export const OPINION_SCOPE_CLASSIFIER_VERSION = 1;

/** Categories whose judicial opinions carry a counting-scope flag. */
export const COUNTING_SCOPE_CATEGORIES: ReadonlySet<string> = new Set([
  'civilLiberties',
  'lawEnforcement',
  'judicialIndependence',
  'courtOrders',
]);

/** Word-boundary, case-insensitive matchers derived from the query phrases. */
const EXEC_POWER_PATTERNS = EXEC_POWER_PHRASES.map(
  (p) => new RegExp(`\\b${p.replace(/ /g, '\\s+')}\\b`, 'i'),
);

function matchesExecPower(text: string): boolean {
  return EXEC_POWER_PATTERNS.some((re) => re.test(text));
}

/**
 * True when an opinion falls inside the documented counting scope:
 * SCOTUS unconditionally; federal circuits and D.D.C. on executive-power
 * language. All other opinions are out of counting scope.
 */
export function isInCountingScope(
  courtName: string | null | undefined,
  title: string,
  content: string | null | undefined,
): boolean {
  const court = classifyCourtName(courtName);
  if (court === 'scotus') return true;
  if (court !== 'circuit' && court !== 'dcd') return false;
  return matchesExecPower(`${title}\n${content ?? ''}`);
}

/**
 * Item-level wrapper for in-memory pipelines (ingest stamping, snapshot
 * scoring). Returns null when the classifier does not apply — non-opinion
 * items and non-court categories carry no flag and are always counted.
 */
export function itemCountingScope(item: ContentItem, category: string): boolean | null {
  // Trust the persisted scope when the item came from a stored row (#667): it
  // was computed at ingest from full content, so it never disagrees with the
  // counting_scope column that G1a checks. Re-classifying here would use the
  // sweep's 16k-truncated content and could flip a circuit/D.D.C. opinion whose
  // executive-power language sits past the cut — skipping its score row while
  // the stored column still marks it in-scope.
  if (item.countingScope !== undefined) return item.countingScope;
  if (item.type !== 'judicial_opinion' || !COUNTING_SCOPE_CATEGORIES.has(category)) return null;
  const court = (item.metadata?.agency as string | undefined) ?? item.agency;
  return isInCountingScope(court, item.title ?? '', item.content);
}

/**
 * SQL equivalent of isInCountingScope for set-based backfills, referencing an
 * aliased documents table. Kept in lockstep with the TS predicate — the
 * classifier equivalence test asserts row-level parity on real data.
 */
export function countingScopeSql(alias: string): string {
  const exec = EXEC_POWER_PHRASES.map((p) => p.replace(/ /g, '\\s+')).join('|');
  const text = `(${alias}.title || E'\\n' || coalesce(${alias}.content, ''))`;
  return `(
    ${alias}.metadata->>'agency' = 'Supreme Court of the United States'
    OR (
      (${alias}.metadata->>'agency' ~ '^Court of Appeals for the .+ Circuit$'
        OR ${alias}.metadata->>'agency' = 'District Court, District of Columbia')
      AND ${text} ~* '\\y(${exec})\\y'
    )
  )`;
}
