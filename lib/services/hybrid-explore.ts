/**
 * Hybrid explore execution (#702): fuses the vector candidate pool with
 * per-alias FTS arms, then pages over the fused id set. Only invoked when at
 * least one corpus-validated alias exists — searchExplore falls back to the
 * pure-vector path otherwise, so pre-#702 behavior is fully preserved.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { buildExploreAliasArmQuery, fetchMatchSnippets, runArms } from '@/lib/services/hybrid-arms';
import type { FusionCandidate } from '@/lib/services/hybrid-fusion';
import { armWeight, fuseWeightedRrf } from '@/lib/services/hybrid-fusion';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';
import {
  buildFilterConditions,
  enrichWithAiAssessments,
  mapToSearchResult,
} from '@/lib/services/search-queries';
import type { ExploreSearchResult, SearchFilters } from '@/lib/services/search-service';

const VECTOR_CANDIDATE_LIMIT = 500;

type Db = ReturnType<typeof getDb>;

/** Fetch the vector candidate ids in similarity order. */
async function vectorCandidateIds(
  db: Db,
  vectorStr: string,
  whereClause: ReturnType<typeof sql>,
): Promise<FusionCandidate[]> {
  const rows = await db.execute(sql`
    SELECT d.id FROM documents d
    LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
    WHERE ${whereClause}
    ORDER BY d.embedding <=> ${vectorStr}::vector
    LIMIT ${VECTOR_CANDIDATE_LIMIT}`);
  return (rows.rows as Array<{ id: number }>).map((r) => ({ id: Number(r.id) }));
}

/** Fetch full result rows for a page of ids, preserving the given order. */
async function fetchRowsByIds(
  db: Db,
  ids: number[],
  vectorStr: string,
  query: string,
): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const rows = await db.execute(sql`
    SELECT d.id, d.title, d.url, d.published_at, d.source_type, d.source_origin, d.category, d.case_id,
      LEFT(d.content, 250) as snippet,
      1 - (d.embedding <=> ${vectorStr}::vector) as cosine_similarity,
      ts_rank_cd(d.search_vector, websearch_to_tsquery('english', ${query})) as text_rank,
      ds.severity_score, ds.final_score, ds.document_class, ds.class_multiplier,
      ds.capture_count, ds.drift_count, ds.warning_count, ds.suppressed_count,
      ds.matches, ds.suppressed
    FROM documents d
    LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
    WHERE d.id IN (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )})`);
  const byId = new Map((rows.rows as Record<string, unknown>[]).map((r) => [Number(r.id), r]));
  return ids.map((id) => byId.get(id)).filter((r): r is Record<string, unknown> => r !== undefined);
}

/** Order the fused ids for non-relevance sorts (date/score) via SQL. */
async function sortIdsBySql(db: Db, ids: number[], sort: 'date' | 'score'): Promise<number[]> {
  if (ids.length === 0) return [];
  const orderBy =
    sort === 'date' ? sql`d.published_at DESC NULLS LAST` : sql`ds.final_score DESC NULLS LAST`;
  const rows = await db.execute(sql`
    SELECT d.id FROM documents d
    LEFT JOIN document_scores ds ON ds.url = d.url AND ds.category = d.category
    WHERE d.id IN (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )})
    ORDER BY ${orderBy}`);
  return (rows.rows as Array<{ id: number }>).map((r) => Number(r.id));
}

/** Map raw arm rows into weighted fusion arms. */
function toFusionArms(armRowLists: Record<string, unknown>[][], aliases: ValidatedAlias[]) {
  return armRowLists.map((rows, i) => ({
    items: rows.map((r) => ({
      id: Number(r.id),
      matchedAlias: (r.matched_alias as string) || undefined,
    })),
    weight: armWeight(aliases[i].matches),
  }));
}

/**
 * Snippets run post-pagination (#702 perf): one batched ts_headline query
 * for only the visible page's keyword docs.
 */
async function attachPageSnippets(
  rows: Record<string, unknown>[],
  pageIds: number[],
  metaById: Map<number, FusionCandidate>,
): Promise<void> {
  const snippetPairs = pageIds
    .map((id) => ({ id, phrase: metaById.get(id)?.matchedAlias }))
    .filter((p): p is { id: number; phrase: string } => Boolean(p.phrase));
  const snippets = await fetchMatchSnippets(snippetPairs);
  for (const row of rows) {
    const meta = metaById.get(Number(row.id));
    if (meta?.matchedAlias) row.matched_alias = meta.matchedAlias;
    const snippet = snippets.get(Number(row.id));
    if (snippet) row.match_snippet = snippet;
  }
}

/**
 * Hybrid vector+alias explore: fuse, page, fetch, enrich. totalResults is
 * the fused unique candidate count (vector pool ∪ alias-arm hits).
 */
export async function hybridVectorExplore(
  db: Db,
  vectorStr: string,
  filters: SearchFilters,
  aliases: ValidatedAlias[],
  page: number,
  pageSize: number,
  offset: number,
): Promise<ExploreSearchResult> {
  const whereParts = [sql`d.embedding IS NOT NULL`, ...buildFilterConditions(filters)];
  const whereClause = sql.join(whereParts, sql` AND `);

  const [primary, armRowLists] = await Promise.all([
    vectorCandidateIds(db, vectorStr, whereClause),
    runArms(aliases.map((a) => buildExploreAliasArmQuery(a, whereClause))),
  ]);
  const arms = toFusionArms(armRowLists, aliases);

  // topK = whole fused set: pagination needs the full ordering and count.
  const fused = fuseWeightedRrf(
    primary,
    arms,
    primary.length + arms.reduce((n, a) => n + a.items.length, 0),
  );
  const totalResults = fused.length;
  const metaById = new Map(fused.map((f) => [f.id, f]));

  const orderedIds =
    filters.sort === 'date' || filters.sort === 'score'
      ? await sortIdsBySql(
          db,
          fused.map((f) => f.id),
          filters.sort,
        )
      : fused.map((f) => f.id);
  const pageIds = orderedIds.slice(offset, offset + pageSize);

  const rows = await fetchRowsByIds(db, pageIds, vectorStr, filters.query);
  await attachPageSnippets(rows, pageIds, metaById);
  await enrichWithAiAssessments(db, rows);
  return {
    totalResults,
    page,
    pageSize,
    documents: rows.map(mapToSearchResult),
    alsoSearched: aliases.map((a) => a.phrase),
  };
}
