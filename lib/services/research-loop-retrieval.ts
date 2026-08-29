/**
 * Enumeration retrieval (#758 R-SALIENCE, #762 R-SLOTS): a single hybrid
 * seed sweep plus GUARANTEED slots for every productive arm — salience,
 * expansion, and mined alike.
 *
 * Why guaranteed slots, not fusion: the instrumented IM3 trace (#756)
 * showed a "J.G.G. v. Trump" arm carrying the target opinions at positions
 * 0-8 and weighted RRF still dropping every one — co-validated generic arms
 * re-boost incumbents and outvote sharp entity arms. #762 measured the same
 * failure for expansion arms: a "Title IX" arm matching 608 docs
 * contributed ZERO candidates (RRF break-even only for its top ~19 hits,
 * fused into positions the salience-reservation slice then discarded). Arms
 * are allocated bounded slots, never made to campaign for them; the
 * per-arm cap keeps any single broad arm from flooding the pool
 * (content-neutral by construction — no arm class is privileged).
 *
 * Why an offline index, not query-time discovery: marquee docs sit at
 * vector sim 0.39-0.44 vs a 0.57 rank-60 cutoff (unreachable at any depth),
 * LLM expansion is knowledge-cutoff-blind, and pool-grounded reading only
 * sees what vector already retrieved. Corpus-wide recurrence — computable
 * weekly in batch — is the salience signal.
 *
 * Failure-tolerant: an empty arm roster (no validated aliases, empty index,
 * selection error) degrades to the seed sweep exactly.
 */

import {
  composeArmSlotPool,
  composeRoster,
  GUARANTEED_SLOTS,
  MAX_ROSTER_ARMS,
  PER_ARM_CAP,
} from '@/lib/services/arm-slot-compose';
import type { SlotArm } from '@/lib/services/arm-slot-compose';
import { composeAspectPools } from '@/lib/services/aspect-composition';
import { ENUM_EXTRACTION } from '@/lib/services/entity-extraction';
import type { EntityEra } from '@/lib/services/hot-entity-ranking';
import { erasForWindow } from '@/lib/services/hot-entity-ranking';
import { selectSalienceArms } from '@/lib/services/hot-entity-selection';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';
import type { ArmHit } from '@/lib/services/research-fusion';
import { runArmsForAliases } from '@/lib/services/research-fusion';
import type { RetrievalResult, WindowTiming } from '@/lib/services/research-retrieval-helpers';
import {
  collectAlsoSearched,
  mergeSearchedTerms,
  rerankForTier,
  toCandidateSummary,
} from '@/lib/services/research-retrieval-helpers';
import type { ResearchDocument, ResearchTierFilter } from '@/lib/services/search-service';
import { fetchResearchDocsByIds, searchResearchWithMeta } from '@/lib/services/search-service';

export { composeArmSlotPool, composeRoster, PER_ARM_CAP } from '@/lib/services/arm-slot-compose';
export type { SlotArm } from '@/lib/services/arm-slot-compose';

/** Hydrate picked arm hits into docs, carrying alias/snippet provenance.
 *  With the query embedding (#800) the docs carry their real cosine
 *  similarity — the 2026-08-29 battery found every arm-slot doc served at
 *  cosine 0, unorderable and halving the reported query confidence. */
async function hydrateArmPool(picked: ArmHit[], embedding?: number[]): Promise<ResearchDocument[]> {
  if (picked.length === 0) return [];
  const vectorStr = embedding ? `[${embedding.join(',')}]` : undefined;
  const docs = await fetchResearchDocsByIds(
    picked.map((h) => h.id),
    vectorStr,
  );
  const hitById = new Map(picked.map((h) => [h.id, h]));
  for (const doc of docs) {
    const hit = hitById.get(doc.id);
    if (hit?.matchedAlias) doc.matchedAlias = hit.matchedAlias;
    if (hit?.matchSnippet) doc.matchSnippet = hit.matchSnippet;
    doc.provenance = 'arm';
  }
  // Preserve slot order (fetch returns arbitrary order).
  const order = new Map(picked.map((h, i) => [h.id, i]));
  return docs.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Arm pool in relevance order (#800): membership is the slot guarantee;
 *  order is the reader's. Stable on ties so slot order still breaks them. */
export function orderArmPoolByCosine(armPool: ResearchDocument[]): ResearchDocument[] {
  return armPool
    .map((d, i) => ({ d, i }))
    .sort((a, b) => b.d.cosineSimilarity - a.d.cosineSimilarity || a.i - b.i)
    .map((x) => x.d);
}

/** Reserve the arm pool's slots; without one, the seed composition stands.
 *  Pure; exported for tests (#800). */
export function composeWithArms(
  seedDocs: ResearchDocument[],
  armPool: ResearchDocument[],
  contextDocs: number,
): ResearchDocument[] {
  if (armPool.length === 0) return seedDocs.slice(0, contextDocs);
  const seedKeep = contextDocs - armPool.length;
  return composeAspectPools(
    [
      { kept: seedDocs.slice(0, seedKeep), overflow: seedDocs.slice(seedKeep) },
      { kept: orderArmPoolByCosine(armPool), overflow: [] },
    ],
    contextDocs,
  ).docs;
}

/** Final relevance pass over the composed pool (#800): the enumeration path
 *  was the only research path that never ran the reranker, so its served
 *  order — which IS the citation order — was a structural seed/arm
 *  interleave with no relevance signal. Membership is untouched (the
 *  reranker keeps all `contextDocs`); on timeout or error the cosine-ordered
 *  composition stands. `ENUM_POOL_RERANK=off` restores the interleave. */
export function enumPoolRerankEnabled(): boolean {
  return process.env.ENUM_POOL_RERANK !== 'off';
}

async function rerankComposedPool(
  query: string,
  docs: ResearchDocument[],
  contextDocs: number,
  tier: ResearchTierFilter,
): Promise<ResearchDocument[]> {
  if (!enumPoolRerankEnabled() || docs.length === 0) return docs;
  try {
    const reranked = await rerankForTier(query, docs, contextDocs, tier);
    return reranked.length === docs.length ? reranked : docs;
  } catch (err) {
    console.warn('[research-loop] pool rerank failed (cosine order kept):', err);
    return docs;
  }
}

/** Dedupe aliases across sources by lowercase phrase, preserving order. */
function dedupeAliases(groups: ValidatedAlias[][]): ValidatedAlias[] {
  const seen = new Set<string>();
  const out: ValidatedAlias[] = [];
  for (const group of groups) {
    for (const alias of group) {
      const key = alias.phrase.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(alias);
    }
  }
  return out;
}

/** Run every productive arm (expansion + mined + salience) into a roster.
 *  Arm queries route through the per-(phrase, window) cache — the seed
 *  sweep already ran the expansion/mined arms, so those are cache hits. */

async function buildArmRoster(
  aliases: ValidatedAlias[],
  dateFrom: string | undefined,
  dateTo: string | undefined,
  priorityPhrases: string[] = [],
): Promise<SlotArm[]> {
  const bounded = composeRoster(aliases, priorityPhrases);
  if (bounded.length === 0) return [];
  const arms = await runArmsForAliases(bounded, dateFrom, dateTo);
  return arms
    .map((arm, i) => ({ phrase: bounded[i].phrase, matches: bounded[i].matches, items: arm.items }))
    .filter((a) => a.items.length > 0);
}

/**
 * Salience stage for an arbitrary retrieval window (#760): select era-scoped
 * entities against the window's docs, run their arms window-scoped alongside
 * any `extraArms` the window already validated (#762: mined aliases get the
 * same slot guarantee — no arm class is privileged), and reserve slots for
 * the hits. Used by the era-stratified path per window; the enumeration
 * loop uses its own composition below. Returns the original docs untouched
 * when the roster is empty.
 */
export async function applySalienceStage(opts: {
  query: string;
  dateFrom: string | undefined;
  dateTo: string | undefined;
  era: EntityEra;
  docs: ResearchDocument[];
  alreadySearched: ValidatedAlias[];
  reserve: number;
  extraArms?: ValidatedAlias[];
  /** Query embedding (#800): arm docs get a real cosine when supplied. */
  embedding?: number[];
}): Promise<{ docs: ResearchDocument[]; salience: ValidatedAlias[] }> {
  const selection = await selectSalienceArms(
    opts.query,
    opts.docs.map((d) => ({ id: d.id, category: d.category })),
    opts.alreadySearched.map((t) => t.phrase),
    [opts.era],
  );
  const salience = selection.arms;
  const roster = await buildArmRoster(
    dedupeAliases([salience, opts.extraArms ?? []]),
    opts.dateFrom,
    opts.dateTo,
    selection.judgedPhrases,
  );
  if (roster.length === 0) return { docs: opts.docs, salience };
  const keep = opts.docs.length;
  const keptIds = new Set(opts.docs.slice(0, keep - opts.reserve).map((d) => d.id));
  const picked = composeArmSlotPool(roster, keptIds, PER_ARM_CAP, opts.reserve);
  const pool = await hydrateArmPool(picked, opts.embedding);
  if (pool.length === 0) return { docs: opts.docs, salience };
  const composed = composeAspectPools(
    [
      {
        kept: opts.docs.slice(0, keep - pool.length),
        overflow: opts.docs.slice(keep - pool.length),
      },
      { kept: orderArmPoolByCosine(pool), overflow: [] },
    ],
    keep,
  ).docs;
  return { docs: composed, salience };
}

/** Salience selection + full arm roster + bounded slot pool (#762). */
async function runArmStage(
  p: LoopRetrievalParams,
  seed: { documents: ResearchDocument[]; minedAliases: ValidatedAlias[] },
  expansionTerms: ValidatedAlias[],
  contextDocs: number,
): Promise<{
  novelSalience: ValidatedAlias[];
  armPool: ResearchDocument[];
  stageTimings: WindowTiming[];
}> {
  // Stage attribution (#780 WP1): the arm stage was one opaque number for
  // the whole 2026-08-24 diagnosis — judge, fan-out, and compose now report
  // separately through the existing windows channel.
  const j0 = Date.now();
  const selection = await selectSalienceArms(
    p.query,
    seed.documents.map((d) => ({ id: d.id, category: d.category })),
    [...expansionTerms, ...seed.minedAliases].map((t) => t.phrase),
    erasForWindow(p.dateFrom ?? null, p.dateTo ?? null),
  );
  const judgeMs = Date.now() - j0;
  const novelSalience = selection.arms;
  const f0 = Date.now();
  const roster = await buildArmRoster(
    dedupeAliases([novelSalience, expansionTerms, seed.minedAliases]),
    p.dateFrom,
    p.dateTo,
    selection.judgedPhrases,
  );
  // The bug #762 fixed: exclude only the KEPT seed prefix, so a doc the
  // seed ranked past the reservation line can still earn an arm slot
  // instead of being both barred and discarded.
  const fanoutMs = Date.now() - f0;
  const h0 = Date.now();
  const maxReserve = Math.min(GUARANTEED_SLOTS, Math.floor(contextDocs / 2));
  const keptSeedIds = new Set(seed.documents.slice(0, contextDocs - maxReserve).map((d) => d.id));
  const picked = composeArmSlotPool(roster, keptSeedIds, PER_ARM_CAP, maxReserve);
  const armPool = await hydrateArmPool(picked, p.embedding);
  const stageTimings: WindowTiming[] = [
    { key: 'judge', searchMs: judgeMs, rerankMs: 0 },
    { key: 'arm-fanout', searchMs: fanoutMs, rerankMs: 0 },
    { key: 'hydrate-compose', searchMs: Date.now() - h0, rerankMs: 0 },
  ];
  return { novelSalience, armPool, stageTimings };
}

/** Seed sweep with its timing row; #762: enumeration mines with the
 *  widened statute-aware config. */
async function runTimedSeed(
  p: LoopRetrievalParams,
  contextDocs: number,
  timings: WindowTiming[],
): Promise<{ documents: ResearchDocument[]; minedAliases: ValidatedAlias[] }> {
  const s0 = Date.now();
  const seedStages: WindowTiming[] = [];
  const seed = await searchResearchWithMeta(
    p.query,
    contextDocs,
    p.embedding,
    p.dateFrom,
    p.dateTo,
    p.tier,
    undefined,
    ENUM_EXTRACTION,
    seedStages,
  );
  timings.push({ key: 'seed', searchMs: Date.now() - s0, rerankMs: 0 }, ...seedStages);
  return seed;
}

/** Arm stage + aggregate-and-per-stage timing rows (#780 WP1). */
async function runTimedArmStage(
  p: LoopRetrievalParams,
  seed: { documents: ResearchDocument[]; minedAliases: ValidatedAlias[] },
  expansionTerms: ValidatedAlias[],
  contextDocs: number,
  timings: WindowTiming[],
): Promise<{ novelSalience: ValidatedAlias[]; armPool: ResearchDocument[] }> {
  const a0 = Date.now();
  const { novelSalience, armPool, stageTimings } = await runArmStage(
    p,
    seed,
    expansionTerms,
    contextDocs,
  );
  timings.push({ key: 'arms', searchMs: Date.now() - a0, rerankMs: 0 }, ...stageTimings);
  return { novelSalience, armPool };
}

/** Seed sweep → all productive arms → bounded guaranteed slots → compose. */
export async function retrieveEnumerationLoop(
  p: LoopRetrievalParams,
  contextDocs: number,
  debug?: boolean,
): Promise<RetrievalResult> {
  const t0 = Date.now();
  const timings: WindowTiming[] = [];

  // Expansion first (#726 convention, re-confirmed by #782 WO-5): its
  // validation counts are CPU-bound and must not compete with the seed's
  // scans. The seed's internal expansion is then a cache hit (or joins the
  // in-flight one), and the terms feed the transparency chips.
  const expansionTerms = await collectAlsoSearched(
    p.query,
    [{ from: p.dateFrom, to: p.dateTo }],
    p.tier,
  );
  const expansionMs = Date.now() - t0;

  const s0 = Date.now();
  const seed = await runTimedSeed(p, contextDocs, timings);

  const { novelSalience, armPool } = await runTimedArmStage(
    p,
    seed,
    expansionTerms,
    contextDocs,
    timings,
  );

  for (const d of seed.documents) d.provenance ??= 'seed';
  const composed = composeWithArms(seed.documents, armPool, contextDocs);
  const r0 = Date.now();
  const docs = await rerankComposedPool(p.query, composed, contextDocs, p.tier);
  timings.push({ key: 'pool-rerank', searchMs: 0, rerankMs: Date.now() - r0 });

  return {
    docs,
    strata: null,
    inferredFrom: p.inferredFrom,
    alsoSearched: mergeSearchedTerms(
      mergeSearchedTerms(expansionTerms, seed.minedAliases),
      novelSalience,
    ),
    timings: {
      expansionMs,
      retrieveWallMs: Date.now() - s0,
      windows: timings,
      totalMs: Date.now() - t0,
    },
    ...(debug
      ? {
          candidates: [...seed.documents, ...armPool].map((d) => toCandidateSummary(d)),
        }
      : {}),
  };
}

export interface LoopRetrievalParams {
  query: string;
  embedding: number[];
  dateFrom: string | undefined;
  dateTo: string | undefined;
  tier: ResearchTierFilter;
  inferredFrom: string | null;
}
