/**
 * Synthesis-context enrichment (#707 audit): the per-document excerpt the
 * LLM sees is the document's opening chars — claims whose support lies
 * deeper are invisible, which produced both the "denies content its own
 * snippets show" class and the Slaughter/Bedoya disposition error ("moot"
 * first appears at char 13,715 of the opinion; the excerpt ends at 3,000).
 *
 * Two targeted, verbatim excerpt classes are attached before prompting:
 * - queryExcerpt: ts_headline windows around the question's own terms, for
 *   EVERY document — generalizes the matched-passage win beyond keyword-arm
 *   survivors.
 * - dispositionExcerpt: for judicial opinions, windows around ruling
 *   language (granted/denied/dismissed/moot/vacated) so holdings are
 *   attributed to the parties the text actually names.
 *
 * Failure-tolerant: enrichment errors leave docs unenriched — synthesis
 * proceeds exactly as before.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import type { ResearchDocument } from '@/lib/services/search-service';

/** Headline scans at most this much content per row (perf bound). */
const HEADLINE_CONTENT_CHARS = 150000;
// StartSel/StopSel are EMPTY (no markers wanted) and MUST stay quoted:
// unquoted empty values are invalid deflist syntax — this exact string
// threw on every call from v1.9.9 to v1.9.26, silently disabling
// enrichment (caught 2026-08-14 via prod logs).
export const QUERY_HEADLINE_OPTS =
  'MaxFragments=2, MaxWords=50, MinWords=15, StartSel="", StopSel=""';
export const DISPOSITION_HEADLINE_OPTS =
  'MaxFragments=3, MaxWords=60, MinWords=20, StartSel="", StopSel=""';
/** Ruling-language terms whose surroundings carry the disposition. */
const DISPOSITION_TSQUERY =
  'granted or denied or dismissed or moot or vacated or affirmed or reversed or remanded';

const JUDICIAL_SOURCE_TYPES = new Set(['judicial_opinion', 'court_opinion']);

/** Attach query-matched and disposition excerpts to docs in place. */
export async function enrichDocsForSynthesis(
  docs: ResearchDocument[],
  query: string,
): Promise<void> {
  if (!isDbAvailable() || docs.length === 0) return;
  const db = getDb();
  const ids = docs.map((d) => d.id);
  const judicialIds = docs.filter((d) => JUDICIAL_SOURCE_TYPES.has(d.sourceType)).map((d) => d.id);
  try {
    const rows = await db.execute(sql`
      SELECT d.id,
        ts_headline('english', LEFT(d.content, ${HEADLINE_CONTENT_CHARS}),
          websearch_to_tsquery('english', ${query}), ${QUERY_HEADLINE_OPTS}) as query_excerpt,
        CASE WHEN d.id IN (${sql.join(
          (judicialIds.length > 0 ? judicialIds : [-1]).map((i) => sql`${i}`),
          sql`, `,
        )})
          THEN ts_headline('english', LEFT(d.content, ${HEADLINE_CONTENT_CHARS}),
            websearch_to_tsquery('english', ${DISPOSITION_TSQUERY}), ${DISPOSITION_HEADLINE_OPTS})
          ELSE NULL
        END as disposition_excerpt
      FROM documents d
      WHERE d.id IN (${sql.join(
        ids.map((i) => sql`${i}`),
        sql`, `,
      )})`);
    const byId = new Map(
      (
        rows.rows as Array<{
          id: number;
          query_excerpt: string | null;
          disposition_excerpt: string | null;
        }>
      ).map((r) => [Number(r.id), r]),
    );
    for (const doc of docs) {
      const r = byId.get(doc.id);
      if (!r) continue;
      if (r.query_excerpt && r.query_excerpt.trim().length >= 20) {
        doc.queryExcerpt = r.query_excerpt.trim();
      }
      if (r.disposition_excerpt && r.disposition_excerpt.trim().length >= 20) {
        doc.dispositionExcerpt = r.disposition_excerpt.trim();
      }
    }
  } catch (err) {
    console.warn('[synthesis-enrichment] failed (synthesis proceeds unenriched):', err);
  }
}
