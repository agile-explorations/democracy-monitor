/**
 * Enumeration retrieval (#758, R-SALIENCE): a single hybrid seed sweep plus
 * salience arms from the weekly hot-entity index (#757), whose hits get
 * GUARANTEED slots in the final pool.
 *
 * Why guaranteed slots, not fusion: the instrumented IM3 trace (#756)
 * showed a "J.G.G. v. Trump" arm carrying the target opinions at positions
 * 0-8 and weighted RRF still dropping every one — co-validated generic arms
 * re-boost incumbents and outvote sharp entity arms. Salience arms exist
 * precisely because similarity failed to surface their documents; they are
 * allocated slots, never made to campaign for them.
 *
 * Why an offline index, not query-time discovery: marquee docs sit at
 * vector sim 0.39-0.44 vs a 0.57 rank-60 cutoff (unreachable at any depth),
 * LLM expansion is knowledge-cutoff-blind, and pool-grounded reading only
 * sees what vector already retrieved. Corpus-wide recurrence — computable
 * weekly in batch — is the salience signal.
 *
 * Failure-tolerant: zero salience arms (empty index, off-topic question,
 * selection error) degrades to the seed sweep exactly.
 */

import { composeAspectPools } from '@/lib/services/aspect-composition';
import type { EntityEra } from '@/lib/services/hot-entity-ranking';
import { eraForDate } from '@/lib/services/hot-entity-ranking';
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

/** Final-pool slots reserved for salience-arm hits (when any exist). */
const FOLLOWUP_SLOTS = 15;

export interface LoopRetrievalParams {
  query: string;
  embedding: number[];
  dateFrom: string | undefined;
  dateTo: string | undefined;
  tier: ResearchTierFilter;
  inferredFrom: string | null;
}

/** Hydrate the salience arms' hits into a ranked doc pool: round-robin
 *  across arms (each arm's best hits first) so one broad arm cannot claim
 *  every reserved slot. */
async function hydrateSaliencePool(
  arms: Array<{ items: ArmHit[] }>,
  excludeIds: Set<number>,
  poolSize: number,
): Promise<ResearchDocument[]> {
  const picked: ArmHit[] = [];
  const seen = new Set<number>();
  for (let round = 0; picked.length < poolSize; round++) {
    let advanced = false;
    for (const arm of arms) {
      if (round >= arm.items.length) continue;
      advanced = true;
      const hit = arm.items[round];
      if (seen.has(hit.id) || excludeIds.has(hit.id)) continue;
      seen.add(hit.id);
      picked.push(hit);
      if (picked.length >= poolSize) break;
    }
    if (!advanced) break;
  }
  if (picked.length === 0) return [];
  const docs = await fetchResearchDocsByIds(picked.map((h) => h.id));
  const hitById = new Map(picked.map((h) => [h.id, h]));
  for (const doc of docs) {
    const hit = hitById.get(doc.id);
    if (hit?.matchedAlias) doc.matchedAlias = hit.matchedAlias;
    if (hit?.matchSnippet) doc.matchSnippet = hit.matchSnippet;
  }
  return docs;
}

/** Reserve FOLLOWUP_SLOTS for the salience pool; without one, the seed
 *  composition stands. */
function composeWithSalience(
  seedDocs: ResearchDocument[],
  saliencePool: ResearchDocument[],
  contextDocs: number,
): ResearchDocument[] {
  if (saliencePool.length === 0) return seedDocs.slice(0, contextDocs);
  const seedKeep = contextDocs - FOLLOWUP_SLOTS;
  return composeAspectPools(
    [
      { kept: seedDocs.slice(0, seedKeep), overflow: seedDocs.slice(seedKeep) },
      {
        kept: saliencePool.slice(0, FOLLOWUP_SLOTS),
        overflow: saliencePool.slice(FOLLOWUP_SLOTS),
      },
    ],
    contextDocs,
  ).docs;
}

/** Select salience arms for the seed pool (phrases the seed already
 *  searched are excluded), run them window-scoped, hydrate their hits. */
async function runSalienceStage(
  p: LoopRetrievalParams,
  seed: { documents: ResearchDocument[]; minedAliases: ValidatedAlias[] },
  expansionTerms: ValidatedAlias[],
): Promise<{ novelSalience: ValidatedAlias[]; saliencePool: ResearchDocument[] }> {
  const novelSalience = await selectSalienceArms(
    p.query,
    seed.documents.map((d) => ({ id: d.id, category: d.category })),
    [...expansionTerms, ...seed.minedAliases].map((t) => t.phrase),
    eraForDate(p.dateFrom ?? null),
  );
  const arms = novelSalience.length
    ? await runArmsForAliases(novelSalience, p.dateFrom, p.dateTo)
    : [];
  const seedIds = new Set(seed.documents.map((d) => d.id));
  const saliencePool = await hydrateSaliencePool(arms, seedIds, FOLLOWUP_SLOTS * 2);
  return { novelSalience, saliencePool };
}

/**
 * Salience stage for an arbitrary retrieval window (#760): select era-scoped
 * entities against the window's docs, run their arms window-scoped, and
 * reserve slots for the hits. Used by the era-stratified path per window;
 * the enumeration loop uses its own composition below. Returns the original
 * docs untouched when selection yields nothing.
 */
export async function applySalienceStage(opts: {
  query: string;
  dateFrom: string | undefined;
  dateTo: string | undefined;
  era: EntityEra;
  docs: ResearchDocument[];
  alreadySearched: ValidatedAlias[];
  reserve: number;
}): Promise<{ docs: ResearchDocument[]; salience: ValidatedAlias[] }> {
  const salience = await selectSalienceArms(
    opts.query,
    opts.docs.map((d) => ({ id: d.id, category: d.category })),
    opts.alreadySearched.map((t) => t.phrase),
    opts.era,
  );
  if (salience.length === 0) return { docs: opts.docs, salience: [] };
  const arms = await runArmsForAliases(salience, opts.dateFrom, opts.dateTo);
  const pool = await hydrateSaliencePool(
    arms,
    new Set(opts.docs.map((d) => d.id)),
    opts.reserve * 2,
  );
  if (pool.length === 0) return { docs: opts.docs, salience };
  const keep = opts.docs.length;
  const composed = composeAspectPools(
    [
      {
        kept: opts.docs.slice(0, keep - opts.reserve),
        overflow: opts.docs.slice(keep - opts.reserve),
      },
      { kept: pool.slice(0, opts.reserve), overflow: pool.slice(opts.reserve) },
    ],
    keep,
  ).docs;
  return { docs: composed, salience };
}

/** Seed sweep → salience arms → guaranteed slots → compose. */
export async function retrieveEnumerationLoop(
  p: LoopRetrievalParams,
  contextDocs: number,
  debug?: boolean,
): Promise<RetrievalResult> {
  const t0 = Date.now();
  const timings: WindowTiming[] = [];

  // Expansion first (#726 convention): warms the alias caches the seed
  // search re-derives internally, and yields the transparency chips.
  const expansionTerms = await collectAlsoSearched(
    p.query,
    [{ from: p.dateFrom, to: p.dateTo }],
    p.tier,
  );
  const expansionMs = Date.now() - t0;

  const s0 = Date.now();
  const seed = await searchResearchWithMeta(
    p.query,
    contextDocs,
    p.embedding,
    p.dateFrom,
    p.dateTo,
    p.tier,
  );
  timings.push({ key: 'seed', searchMs: Date.now() - s0, rerankMs: 0 });

  const a0 = Date.now();
  const { novelSalience, saliencePool } = await runSalienceStage(p, seed, expansionTerms);
  timings.push({ key: 'salience', searchMs: Date.now() - a0, rerankMs: 0 });

  const docs = composeWithSalience(seed.documents, saliencePool, contextDocs);

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
          candidates: [...seed.documents, ...saliencePool].map((d) => toCandidateSummary(d)),
        }
      : {}),
  };
}
