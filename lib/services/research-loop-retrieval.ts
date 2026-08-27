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
  toCandidateSummary,
} from '@/lib/services/research-retrieval-helpers';
import type { ResearchDocument, ResearchTierFilter } from '@/lib/services/search-service';
import { fetchResearchDocsByIds, searchResearchWithMeta } from '@/lib/services/search-service';

export { composeArmSlotPool, composeRoster, PER_ARM_CAP } from '@/lib/services/arm-slot-compose';
export type { SlotArm } from '@/lib/services/arm-slot-compose';

/** Hydrate picked arm hits into docs, carrying alias/snippet provenance. */
async function hydrateArmPool(picked: ArmHit[]): Promise<ResearchDocument[]> {
  if (picked.length === 0) return [];
  const docs = await fetchResearchDocsByIds(picked.map((h) => h.id));
  const hitById = new Map(picked.map((h) => [h.id, h]));
  for (const doc of docs) {
    const hit = hitById.get(doc.id);
    if (hit?.matchedAlias) doc.matchedAlias = hit.matchedAlias;
    if (hit?.matchSnippet) doc.matchSnippet = hit.matchSnippet;
  }
  // Preserve slot order (fetch returns arbitrary order).
  const order = new Map(picked.map((h, i) => [h.id, i]));
  return docs.sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
}

/** Reserve the arm pool's slots; without one, the seed composition stands. */
function composeWithArms(
  seedDocs: ResearchDocument[],
  armPool: ResearchDocument[],
  contextDocs: number,
): ResearchDocument[] {
  if (armPool.length === 0) return seedDocs.slice(0, contextDocs);
  const seedKeep = contextDocs - armPool.length;
  return composeAspectPools(
    [
      { kept: seedDocs.slice(0, seedKeep), overflow: seedDocs.slice(seedKeep) },
      { kept: armPool, overflow: [] },
    ],
    contextDocs,
  ).docs;
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
  const pool = await hydrateArmPool(picked);
  if (pool.length === 0) return { docs: opts.docs, salience };
  const composed = composeAspectPools(
    [
      {
        kept: opts.docs.slice(0, keep - pool.length),
        overflow: opts.docs.slice(keep - pool.length),
      },
      { kept: pool, overflow: [] },
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
  const armPool = await hydrateArmPool(picked);
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

  // Expansion and seed start together (#782 WO-5): the seed derives the same
  // expansion internally and joins the in-flight validation, so the vector
  // queries and mining extraction no longer wait behind the LLM + counts.
  const s0 = Date.now();
  const [expansion, seed] = await Promise.all([
    collectAlsoSearched(p.query, [{ from: p.dateFrom, to: p.dateTo }], p.tier).then((terms) => ({
      terms,
      ms: Date.now() - t0,
    })),
    runTimedSeed(p, contextDocs, timings),
  ]);
  const { terms: expansionTerms, ms: expansionMs } = expansion;

  const { novelSalience, armPool } = await runTimedArmStage(
    p,
    seed,
    expansionTerms,
    contextDocs,
    timings,
  );

  const docs = composeWithArms(seed.documents, armPool, contextDocs);

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
