/**
 * Hybrid explore execution (#702): fuses the vector candidate pool with
 * per-alias FTS arms, then pages over the fused id set. Only invoked when at
 * least one corpus-validated alias exists — searchExplore falls back to the
 * pure-vector path otherwise, so pre-#702 behavior is fully preserved.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { fetchRowsForDocKeys, orderedUniqueDocKeys } from '@/lib/services/explore-document-paging';
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

/** Look up urls for the fused ids so pagination can key on documents. */
async function urlsByIds(db: Db, ids: number[]): Promise<Map<number, string | null>> {
  if (ids.length === 0) return new Map();
  const rows = await db.execute(sql`
    SELECT id, url FROM documents WHERE id IN (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )})`);
  return new Map(
    (rows.rows as Array<{ id: number; url: string | null }>).map((r) => [Number(r.id), r.url]),
  );
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
  metaById: Map<number, FusionCandidate>,
): Promise<void> {
  const snippetPairs = rows
    .map((row) => ({ id: Number(row.id), phrase: metaById.get(Number(row.id))?.matchedAlias }))
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
 * Hybrid vector+alias explore: fuse, page over unique DOCUMENTS (#728),
 * fetch every category row for the paged documents, enrich. totalResults is
 * the fused unique document count (vector pool ∪ alias-arm hits).
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
  const metaById = new Map(fused.map((f) => [f.id, f]));

  const orderedIds =
    filters.sort === 'date' || filters.sort === 'score'
      ? await sortIdsBySql(
          db,
          fused.map((f) => f.id),
          filters.sort,
        )
      : fused.map((f) => f.id);

  // Document-level paging: a document's best-ranked row defines its position.
  const urlById = await urlsByIds(db, orderedIds);
  const docKeys = orderedUniqueDocKeys(
    orderedIds.map((id) => ({ id, url: urlById.get(id) ?? null })),
  );
  const totalResults = docKeys.length;
  const pageKeys = docKeys.slice(offset, offset + pageSize);

  const rows = await fetchRowsForDocKeys(db, pageKeys, whereClause, vectorStr, filters.query);
  await attachPageSnippets(rows, metaById);
  await enrichWithAiAssessments(db, rows);
  return {
    totalResults,
    page,
    pageSize,
    documents: rows.map(mapToSearchResult),
    alsoSearched: aliases.map((a) => a.phrase),
  };
}
