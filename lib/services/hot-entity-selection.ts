/**
 * Query-time salience arm selection (#758): mechanical signals NOMINATE a
 * labeled shortlist from the weekly hot-entity index (#757); a shortlist
 * judge (hot-entity-judge.ts) PICKS the arms.
 *
 * Nomination blends two pool-anchored signals at different granularities:
 * 1. DOC JOIN (fine): entities whose mention docs appear in the pool.
 *    Capped — opinion-heavy pools cite dozens of co-indexed captions and
 *    would refill every slot with their own genre (measured, IM3).
 * 2. CATEGORY ENRICHMENT (coarse): entities sharing the categories this
 *    pool is UNUSUALLY about (pool share ÷ global share — raw counts are
 *    non-discriminating because civilLiberties tops every pool), ranked by
 *    breadth-weighted, baseline-collapsed recurrence.
 *
 * Six measured iterations showed mechanical ranking finds the right
 * NEIGHBORHOOD but mis-orders the final twelve; the judge resolves that as
 * a labeled multiple-choice. Phrase-embedding similarity was evaluated and
 * rejected outright (junk statutes outscored J.G.G. v. Trump on the very
 * question about it). Failure-tolerant at every stage: judge failure falls
 * back to the mechanical ranking; any error returns [] (seed-only build).
 * Pure ranking halves exported for tests.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import type { JudgeCandidate } from '@/lib/services/hot-entity-judge';
import { judgeShortlist } from '@/lib/services/hot-entity-judge';
import type { EntityEra } from '@/lib/services/hot-entity-ranking';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';

/** Arms handed to the guaranteed slots per question. */
export const MAX_SALIENCE_ARMS = 12;
/** Doc-join floor: one passing mention in one pool doc is incidental. */
export const MIN_POOL_MENTIONS = 2;
/** Pool categories considered "dominant". */
const TOP_POOL_CATEGORIES = 2;
/** Shortlist slots offered to the judge, per nomination channel. */
const SHORTLIST_POOL = 15;
const SHORTLIST_CATEGORY = 40;

export interface EntityRow {
  phrase: string;
  entityClass: string;
  categories: string[];
  ftsMatches: number;
  docFreqTerm: number;
  docFreqBaseline: number;
}

export interface PoolEntityRow extends EntityRow {
  /** How many of the question's pool docs mention this entity. */
  poolMentions: number;
}

const novelty = (r: { docFreqTerm: number; docFreqBaseline: number }) =>
  r.docFreqTerm / (1 + r.docFreqBaseline);

/** Rank pool-discussed entities: pool mentions first, novelty tiebreak,
 *  phrase for determinism. Pure; exported for tests. */
export function rankPoolEntities(
  rows: PoolEntityRow[],
  minMentions: number = MIN_POOL_MENTIONS,
): PoolEntityRow[] {
  return rows
    .filter((r) => r.poolMentions >= minMentions)
    .sort(
      (a, b) =>
        b.poolMentions - a.poolMentions ||
        novelty(b) - novelty(a) ||
        a.phrase.localeCompare(b.phrase),
    );
}

/** Breadth-weighted, baseline-collapsed recurrence — cross-cutting
 *  recurrence is what "marquee" means in this product. Pure. */
export function categoryFillScore(r: EntityRow): number {
  return (r.docFreqTerm * Math.max(1, r.categories.length)) / (1 + r.docFreqBaseline);
}

export function rankCategoryEntities(rows: EntityRow[]): EntityRow[] {
  return [...rows].sort(
    (a, b) => categoryFillScore(b) - categoryFillScore(a) || a.phrase.localeCompare(b.phrase),
  );
}

/** The pool's dominant categories by ENRICHMENT — pool share divided by
 *  global share. Raw counts are non-discriminating: civilLiberties is the
 *  corpus's largest category and tops every pool. Pure; exported for tests. */
export function dominantCategories(
  poolCategories: Array<string | null | undefined>,
  globalShares: Map<string, number>,
  top: number = TOP_POOL_CATEGORIES,
): string[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const c of poolCategories) {
    if (!c) continue;
    counts.set(c, (counts.get(c) ?? 0) + 1);
    total++;
  }
  if (total === 0) return [];
  return [...counts.entries()]
    .map(([c, n]) => ({
      c,
      enrichment: n / total / (globalShares.get(c) ?? 1 / (globalShares.size || 1)),
    }))
    .sort((a, b) => b.enrichment - a.enrichment || a.c.localeCompare(b.c))
    .slice(0, top)
    .map((e) => e.c);
}

/** Nominate the labeled shortlist: doc-join hits first, category fill after,
 *  deduped, exclusion applied before any slot is consumed (phrases the seed
 *  already searched must not consume shortlist room — measured, IM3). Pure. */
export function nominateShortlist(
  poolRows: PoolEntityRow[],
  categoryRows: EntityRow[],
  excludePhrases: string[],
): EntityRow[] {
  const excluded = new Set(excludePhrases.map((ph) => ph.toLowerCase()));
  const shortlist: EntityRow[] = [];
  const seen = new Set<string>();
  const push = (r: EntityRow) => {
    const key = r.phrase.toLowerCase();
    if (excluded.has(key) || seen.has(key)) return;
    seen.add(key);
    shortlist.push(r);
  };
  rankPoolEntities(poolRows).slice(0, SHORTLIST_POOL).forEach(push);
  rankCategoryEntities(categoryRows).slice(0, SHORTLIST_CATEGORY).forEach(push);
  return shortlist;
}

async function queryGlobalCategoryShares(): Promise<Map<string, number>> {
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

async function queryPoolJoin(seedDocIds: number[], era: EntityEra): Promise<PoolEntityRow[]> {
  const db = getDb();
  const result = await db.execute(sql`
    SELECT e.phrase, e.entity_class, e.categories, e.fts_matches,
           e.doc_freq_term, e.doc_freq_baseline, count(*) AS pool_mentions
    FROM hot_entity_docs d
    JOIN hot_entities e ON e.id = d.entity_id
    WHERE e.era = ${era} AND d.doc_id IN (${sql.join(
      seedDocIds.map((i) => sql`${i}`),
      sql`, `,
    )})
    GROUP BY e.id, e.phrase, e.entity_class, e.categories, e.fts_matches,
             e.doc_freq_term, e.doc_freq_baseline`);
  return (result.rows as Array<Record<string, unknown>>).map((r) => ({
    ...mapEntityRow(r),
    poolMentions: Number(r.pool_mentions),
  }));
}

async function queryCategoryMatch(categories: string[], era: EntityEra): Promise<EntityRow[]> {
  if (categories.length === 0) return [];
  const db = getDb();
  const result = await db.execute(sql`
    SELECT e.phrase, e.entity_class, e.categories, e.fts_matches,
           e.doc_freq_term, e.doc_freq_baseline
    FROM hot_entities e
    WHERE e.era = ${era} AND e.categories ?| array[${sql.join(
      categories.map((c) => sql`${c}`),
      sql`, `,
    )}]::text[]`);
  return (result.rows as Array<Record<string, unknown>>).map(mapEntityRow);
}

/** Judge-pick stability floor (#760): environment-sensitive shortlists made
 *  judge picks flip between local and prod (IM3 lost its caption picks).
 *  The top mechanical nominees from each channel are ALWAYS included —
 *  top-2 pool-discussed + top-2 breadth-ranked captions — so no single
 *  judge call can zero out either channel. Pure; exported for tests. */
export function stabilityFloor(shortlist: EntityRow[], poolCount: number): EntityRow[] {
  const fromPool = shortlist.slice(0, Math.min(2, poolCount));
  const inPool = new Set(fromPool.map((r) => r.phrase.toLowerCase()));
  const captions = shortlist
    .filter((r) => r.entityClass === 'caption' && !inPool.has(r.phrase.toLowerCase()))
    .slice(0, 2);
  return [...fromPool, ...captions];
}

/** Floor ∪ judge picks (mechanical fallback when picks are null), deduped
 *  and capped. Pure; exported for tests via stabilityFloor. */
function finalizeArms(
  shortlist: EntityRow[],
  picks: string[] | null,
  poolRows: PoolEntityRow[],
  excludePhrases: string[],
): ValidatedAlias[] {
  const byPhrase = new Map(shortlist.map((r) => [r.phrase.toLowerCase(), r]));
  const judged =
    picks !== null
      ? picks.map((ph) => byPhrase.get(ph.toLowerCase())).filter((r): r is EntityRow => !!r)
      : shortlist;
  const excluded = new Set(excludePhrases.map((ph) => ph.toLowerCase()));
  const poolCount = rankPoolEntities(poolRows).filter(
    (r) => !excluded.has(r.phrase.toLowerCase()),
  ).length;
  const floor = stabilityFloor(shortlist, poolCount);
  const seen = new Set<string>();
  const chosen: EntityRow[] = [];
  for (const r of [...floor, ...judged]) {
    const k = r.phrase.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    chosen.push(r);
  }
  return chosen
    .slice(0, MAX_SALIENCE_ARMS)
    .map((r) => ({ phrase: r.phrase, matches: r.ftsMatches }));
}

export async function selectSalienceArms(
  question: string,
  seedDocs: Array<{ id: number; category: string | null }>,
  excludePhrases: string[],
  era: EntityEra,
): Promise<ValidatedAlias[]> {
  if (!isDbAvailable() || seedDocs.length === 0) return [];
  try {
    const globalShares = await queryGlobalCategoryShares();
    const [poolRows, categoryRows] = await Promise.all([
      queryPoolJoin(
        seedDocs.map((d) => d.id),
        era,
      ),
      queryCategoryMatch(
        dominantCategories(
          seedDocs.map((d) => d.category),
          globalShares,
        ),
        era,
      ),
    ]);
    const shortlist = nominateShortlist(poolRows, categoryRows, excludePhrases);
    if (shortlist.length === 0) return [];
    const candidates: JudgeCandidate[] = shortlist.map((r) => ({
      phrase: r.phrase,
      entityClass: r.entityClass,
      categories: r.categories,
      docFreqTerm: r.docFreqTerm,
    }));
    const picks = await judgeShortlist(question, candidates);
    return finalizeArms(shortlist, picks, poolRows, excludePhrases);
  } catch (err) {
    console.warn('[hot-entity-selection] failed (continuing seed-only):', err);
    return [];
  }
}
