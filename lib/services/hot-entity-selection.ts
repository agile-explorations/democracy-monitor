/**
 * Query-time salience arm selection (#758): mechanical signals NOMINATE a
 * labeled shortlist from the weekly hot-entity index (#757); a shortlist
 * judge (hot-entity-judge.ts) PICKS the arms.
 *
 * Nomination blends three signals at different granularities:
 * 1. DOC JOIN (fine): entities whose mention docs appear in the pool.
 *    Capped — opinion-heavy pools cite dozens of co-indexed captions and
 *    would refill every slot with their own genre (measured, IM3).
 * 2. CATEGORY ENRICHMENT (coarse): entities sharing the categories this
 *    pool is UNUSUALLY about (pool share ÷ global share — raw counts are
 *    non-discriminating because civilLiberties tops every pool), ranked by
 *    breadth-weighted, baseline-collapsed recurrence. A support floor
 *    keeps one stray pool doc from crowning its category (measured, H3:
 *    a single mediaFreedom doc outranked lawEnforcement 10/60 because
 *    mediaFreedom's global share is tiny).
 * 3. GLOBAL BREADTH (era-wide): the era's top entities by breadth score
 *    regardless of category. Both pool channels are circular — they can
 *    only surface what the seed pool already discusses — so an era-defining
 *    entity the seed missed entirely (U.S. v. Comey for H3) needs a
 *    category-agnostic path to the judge, who filters topical fit.
 *
 * Six measured iterations showed mechanical ranking finds the right
 * NEIGHBORHOOD but mis-orders the final twelve; the judge resolves that as
 * a labeled multiple-choice (phrase-embedding similarity was evaluated and
 * rejected: junk statutes outscored J.G.G. v. Trump). Failure-tolerant at
 * every stage — judge failure falls back to the mechanical ranking; any
 * error returns the empty selection. Pure ranking halves exported for tests.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import type { JudgeCandidate } from '@/lib/services/hot-entity-judge';
import { judgeShortlist } from '@/lib/services/hot-entity-judge';
import type {
  EntityEra,
  EntityRow,
  NominationChannel,
  PoolEntityRow,
} from '@/lib/services/hot-entity-ranking';
import { rankCategoryEntities, stratifyByClass } from '@/lib/services/hot-entity-ranking';
import { logSalienceOutcome } from '@/lib/services/hot-entity-trace';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';

export type {
  EntityRow,
  NominationChannel,
  PoolEntityRow,
} from '@/lib/services/hot-entity-ranking';
export {
  CATEGORY_CLASS_QUOTA,
  categoryFillScore,
  rankCategoryEntities,
  stratifyByClass,
} from '@/lib/services/hot-entity-ranking';

/** Judge-picked arms per question (judged portion semantics, #758). */
export const MAX_SALIENCE_ARMS = 12;
/** Total arms after the mechanical top-up (#762: safe because every arm's
 *  pool share is bounded by the per-arm slot cap). */
export const MAX_SALIENCE_ARMS_ENUM = 20;
/** Top mechanical nominees ALWAYS run as arms, judge picks or not (#762). */
const MECHANICAL_TOP_UP = 8;
/** Doc-join floor: one passing mention in one pool doc is incidental. */
export const MIN_POOL_MENTIONS = 2;
const TOP_POOL_CATEGORIES = 2; // pool categories considered "dominant"
/** Shortlist slots offered to the judge, per nomination channel. */
const SHORTLIST_POOL = 15;
const SHORTLIST_CATEGORY = 40;
const SHORTLIST_GLOBAL = 20;
const SHORTLIST_QUESTION = 15; // question-conditioned channel slots (#776)
const QUESTION_CHANNEL_LIMIT = 20;
/** Pool support a category needs before it can rank as dominant: at least
 *  two docs, scaling with pool size (5%). One stray doc is never "what the
 *  pool is about" — measured, H3. */
export function categorySupportFloor(poolTotal: number): number {
  return Math.max(2, Math.ceil(poolTotal * 0.05));
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
  const floor = categorySupportFloor(total);
  const qualified = [...counts.entries()].filter(([, n]) => n >= floor);
  const pool = qualified.length > 0 ? qualified : [...counts.entries()];
  return pool
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
  globalRows: EntityRow[] = [],
  questionRows: EntityRow[] = [],
): EntityRow[] {
  const excluded = new Set(excludePhrases.map((ph) => ph.toLowerCase()));
  const shortlist: EntityRow[] = [];
  const seen = new Set<string>();
  // Channel order is also channel precedence (#799): a nominee reached by
  // several channels keeps the most question-conditioned one.
  const push = (channel: NominationChannel) => (r: EntityRow) => {
    const key = r.phrase.toLowerCase();
    if (excluded.has(key) || seen.has(key)) return;
    seen.add(key);
    shortlist.push({ ...r, channel });
  };
  rankPoolEntities(poolRows).slice(0, SHORTLIST_POOL).forEach(push('pool'));
  // #776: question-conditioned nominees precede the question-blind
  // channels — they carry the strongest relevance signal.
  questionRows.slice(0, SHORTLIST_QUESTION).forEach(push('question'));
  rankCategoryEntities(categoryRows).slice(0, SHORTLIST_CATEGORY).forEach(push('category'));
  rankCategoryEntities(globalRows).slice(0, SHORTLIST_GLOBAL).forEach(push('global'));
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

/** Nominees eligible for the judge-bypassing top-up (#799): every channel
 *  but `global`. The 2026-08-29 battery measured the global channel's
 *  era-wide breadth leaders ("Public Law 119-21" on 29 of 31 questions,
 *  EO 14219 on 28) riding into the top-up of nearly every question — they
 *  are question-blind by construction, so they must earn a seat from the
 *  judge. Untagged rows (older callers, tests) stay eligible. Pure. */
export function topUpEligible(shortlist: EntityRow[]): EntityRow[] {
  return shortlist.filter((r) => r.channel !== 'global');
}

/** Floor ∪ judge picks ∪ top mechanical nominees (#762), deduped and
 *  capped. The judge orders the best twelve; the mechanical top-up ensures
 *  high-ranked nominees run as arms even when the judge passes them over —
 *  safe because every arm's pool share is slot-bounded. Pure; exported for
 *  tests via stabilityFloor. */
export function finalizeArms(
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
  // #774: the top-up ranks by breadth score across ALL channels, not
  // shortlist position — shortlist-head order re-amplified the pool
  // channel's genre floods (IM3's habeas mill outranked the due-process
  // canon 15 captions deep despite 4x lower breadth).
  // #799: the top-up never draws from the question-blind global channel.
  const topUp = rankCategoryEntities(topUpEligible(shortlist)).slice(0, MECHANICAL_TOP_UP);
  const seen = new Set<string>();
  const chosen: EntityRow[] = [];
  for (const r of [...floor, ...judged.slice(0, MAX_SALIENCE_ARMS), ...topUp]) {
    const k = r.phrase.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    chosen.push(r);
  }
  return chosen
    .slice(0, MAX_SALIENCE_ARMS_ENUM)
    .map((r) => ({ phrase: r.phrase, matches: r.ftsMatches }));
}

export interface SalienceSelection {
  arms: ValidatedAlias[];
  /** Judge picks (relevance order) in arms; composeRoster reserves seats. */
  judgedPhrases: string[];
}

const NO_SALIENCE: SalienceSelection = { arms: [], judgedPhrases: [] };

export async function selectSalienceArms(
  question: string,
  seedDocs: Array<{ id: number; category: string | null }>,
  excludePhrases: string[],
  eras: EntityEra[],
): Promise<SalienceSelection> {
  if (!isDbAvailable() || seedDocs.length === 0 || eras.length === 0) return NO_SALIENCE;
  try {
    const globalShares = await queryGlobalCategoryShares();
    const [poolRows, categoryRows, globalRows, questionRows] = await Promise.all([
      queryPoolJoin(seedDocs.map((d) => d.id)),
      queryCategoryMatch(
        dominantCategories(
          seedDocs.map((d) => d.category),
          globalShares,
        ),
        eras,
      ),
      queryGlobalTop(eras),
      queryQuestionMatch(question, eras),
    ]);
    const shortlist = nominateShortlist(
      poolRows,
      stratifyByClass(categoryRows),
      excludePhrases,
      globalRows,
      questionRows,
    );
    if (shortlist.length === 0) return NO_SALIENCE;
    const candidates: JudgeCandidate[] = shortlist.map((r) => ({
      phrase: r.phrase,
      entityClass: r.entityClass,
      categories: r.categories,
      docFreqTerm: r.docFreqTerm,
    }));
    const picks = await judgeShortlist(question, candidates);
    const arms = finalizeArms(shortlist, picks, poolRows, excludePhrases);
    logSalienceOutcome({ eras, poolRows, questionRows, shortlist, picks, arms });
    const inArms = new Set(arms.map((a) => a.phrase.toLowerCase()));
    return { arms, judgedPhrases: (picks ?? []).filter((ph) => inArms.has(ph.toLowerCase())) };
  } catch (err) {
    console.warn('[hot-entity-selection] failed (continuing seed-only):', err);
    return NO_SALIENCE;
  }
}
