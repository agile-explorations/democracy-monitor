/**
 * Nomination queries for query-time salience (#758, split from
 * hot-entity-selection.ts for single responsibility: this module is the
 * DB I/O, the selection module is pure ranking + orchestration). Four
 * channels, each a query over the weekly hot-entity index (#757):
 * pool doc-join, question match (#776), category enrichment, global
 * breadth. Channel semantics are documented on each query.
 */

import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import type { EntityEra, EntityRow, PoolEntityRow } from '@/lib/services/hot-entity-ranking';

/** Shortlist slots the global (era-wide, question-blind) channel may offer. */
export const SHORTLIST_GLOBAL = 20;
const QUESTION_CHANNEL_LIMIT = 20;

export interface NominationRows {
  poolRows: PoolEntityRow[];
  categoryRows: EntityRow[];
  globalRows: EntityRow[];
  questionRows: EntityRow[];
}

/** The four nomination channels in one fan-out. `dominant` is the pool's
 *  dominant categories (computed by the caller from the global shares). */
export async function nominateFromDb(
  question: string,
  seedDocIds: number[],
  dominant: string[],
  eras: EntityEra[],
): Promise<NominationRows> {
  const [poolRows, categoryRows, globalRows, questionRows] = await Promise.all([
    queryPoolJoin(seedDocIds),
    queryCategoryMatch(dominant, eras),
    queryGlobalTop(eras),
    queryQuestionMatch(question, eras),
  ]);
  return { poolRows, categoryRows, globalRows, questionRows };
}

export async function queryGlobalCategoryShares(): Promise<Map<string, number>> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT cat, count(*) AS n
    FROM hot_entities, jsonb_array_elements_text(categories) AS cat
    GROUP BY cat`);
  const rows = result.rows as Array<{ cat: string; n: string | number }>;
  const total = rows.reduce((sum, r) => sum + Number(r.n), 0);
  return new Map(rows.map((r) => [r.cat, Number(r.n) / Math.max(1, total)]));
}

function mapEntityRow(r: Record<string, unknown>): EntityRow {
  return {
    phrase: r.phrase as string,
    entityClass: r.entity_class as string,
    categories: (r.categories as string[]) ?? [],
    ftsMatches: r.fts_matches as number,
    docFreqTerm: r.doc_freq_term as number,
    docFreqBaseline: r.doc_freq_baseline as number,
  };
}

/** Pool doc-join across ALL eras (#762): pool docs are already
 *  window-scoped, so a mention in the pool IS window-relevance evidence
 *  regardless of which era row indexed the entity (the Bolton case:
 *  trump_t1 entity, current-window documents). Aggregated by phrase. */
async function queryPoolJoin(seedDocIds: number[]): Promise<PoolEntityRow[]> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT e.phrase, max(e.entity_class) AS entity_class,
           max(e.categories::text)::jsonb AS categories, max(e.fts_matches) AS fts_matches,
           max(e.doc_freq_term) AS doc_freq_term, min(e.doc_freq_baseline) AS doc_freq_baseline,
           count(DISTINCT d.doc_id) AS pool_mentions
    FROM hot_entity_docs d
    JOIN hot_entities e ON e.id = d.entity_id
    WHERE d.doc_id IN (${sql.join(
      seedDocIds.map((i) => sql`${i}`),
      sql`, `,
    )})
    GROUP BY e.phrase`);
  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    ...mapEntityRow(r),
    poolMentions: Number(r.pool_mentions),
  }));
}

/** Era-wide top entities by breadth score, category-agnostic (channel 3).
 *  Ordered in SQL so the LIMIT binds the transfer, not the ranking. */
async function queryGlobalTop(eras: EntityEra[]): Promise<EntityRow[]> {
  const db = getDb();
  const rows: EntityRow[] = [];
  for (const era of eras) {
    const result = await db.execute(sql`
      SELECT e.phrase, e.entity_class, e.categories, e.fts_matches,
             e.doc_freq_term, e.doc_freq_baseline
      FROM hot_entities e
      WHERE e.era = ${era}
      ORDER BY (e.doc_freq_term * greatest(1, jsonb_array_length(e.categories)))
               / (1 + e.doc_freq_baseline) DESC, e.phrase
      LIMIT ${SHORTLIST_GLOBAL}`);
    rows.push(...(result.rows as Array<Record<string, unknown>>).map(mapEntityRow));
  }
  return rows;
}

/** Question-conditioned nomination (#776): entities whose MENTION DOCS
 *  match the question's own terms. The other channels are question-blind
 *  (category/global) or pool-circular (doc-join); this one lets the
 *  question's vocabulary reach entities the pool never retrieved — J.G.G.'s
 *  19 mention docs are saturated with "due process" while no giant's are.
 *  Score = matches x share (matches^2 / docFreq): volume alone would
 *  re-admit the giants, share alone would admit 1-doc noise. Mechanical
 *  and content-neutral; the question text drives it, nothing curated. */
/** Per-era question matching, recency-first merge: one combined LIMIT let
 *  baseline-era omnibus granules (matching any long question's AND terms)
 *  bury current-era entities (2026-08-24 gate miss). */
async function queryQuestionMatch(question: string, eras: EntityEra[]): Promise<EntityRow[]> {
  const perEra = await Promise.all(eras.map((era) => queryQuestionMatchForEra(question, era)));
  return [...perEra].reverse().flat();
}

async function queryQuestionMatchForEra(question: string, era: EntityEra): Promise<EntityRow[]> {
  const db = getDb();
  // LIMIT-bound the FTS side (#776 hotfix): a generic question matches
  // enormous doc sets and the aggregation pays for every matching junction
  // row before any LIMIT. The CTE caps scanned matches; entity mention
  // docs are a ~40k subset, so 5000 sampled matches rank entities fine.
  const result = await db.execute(sql`
    WITH qdocs AS (
      SELECT d.id FROM documents d
      WHERE d.search_vector @@ websearch_to_tsquery('english', ${question})
        AND EXISTS (SELECT 1 FROM hot_entity_docs h WHERE h.doc_id = d.id)
      LIMIT 5000
    )
    SELECT e.phrase, max(e.entity_class) AS entity_class,
           max(e.categories::text)::jsonb AS categories, max(e.fts_matches) AS fts_matches,
           max(e.doc_freq_term) AS doc_freq_term, min(e.doc_freq_baseline) AS doc_freq_baseline,
           count(DISTINCT hd.doc_id) AS q_matches
    FROM hot_entity_docs hd
    JOIN qdocs q ON q.id = hd.doc_id
    JOIN hot_entities e ON e.id = hd.entity_id
    WHERE e.era = ${era}
    GROUP BY e.phrase
    ORDER BY (count(DISTINCT hd.doc_id) * count(DISTINCT hd.doc_id))::float
             / greatest(1, max(e.doc_freq_term)) DESC
    LIMIT ${QUESTION_CHANNEL_LIMIT}`);
  return (result.rows as Array<Record<string, unknown>>).map(mapEntityRow);
}

async function queryCategoryMatch(categories: string[], eras: EntityEra[]): Promise<EntityRow[]> {
  if (categories.length === 0 || eras.length === 0) return [];
  const db = getDb();
  const result = await db.execute(sql`
    SELECT e.phrase, e.entity_class, e.categories, e.fts_matches,
           e.doc_freq_term, e.doc_freq_baseline
    FROM hot_entities e
    WHERE e.era IN (${sql.join(
      eras.map((e) => sql`${e}`),
      sql`, `,
    )}) AND e.categories ?| array[${sql.join(
      categories.map((c) => sql`${c}`),
      sql`, `,
    )}]::text[]`);
  return (result.rows as Array<Record<string, unknown>>).map(mapEntityRow);
}
