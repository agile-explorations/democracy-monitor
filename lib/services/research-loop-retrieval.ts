/**
 * Read-and-follow-up retrieval loop for enumeration questions (#756).
 *
 * One bounded round of what a researcher does by hand: retrieve, READ what
 * came back, notice which named entities the pool discusses but does not
 * contain, and search again for exactly those. The read step
 * (followup-proposal-service) is corpus-grounded — it reports entities from
 * the pool's own text, so the model's knowledge cutoff is irrelevant; the
 * follow-up phrases pass standard alias validation and their arm hits get
 * GUARANTEED slots in the final pool. The instrumented IM3 trace showed why
 * a fusion vote cannot be trusted with this: a "J.G.G. v. Trump" arm
 * carried the target opinions at positions 0-8 and weighted RRF still
 * dropped every one — dozens of co-validated generic arms re-boost the
 * incumbent docs and outvote the sharp entity arms. Follow-up arms exist
 * precisely because the pool lacked their documents; they do not campaign
 * for slots, they are allocated them.
 *
 * Recency stratum: an undated enumeration question retrieves in TWO windows
 * — full history and the current term — composed round-robin. Without it,
 * the corpus's historical gravity (decades of caselaw and rulemaking)
 * swamps current-term litigation in both vector and mining space.
 */

import { composeAspectPools } from '@/lib/services/aspect-composition';
import { mineEntityAliases } from '@/lib/services/entity-mining';
import { ERA_WINDOWS } from '@/lib/services/era-extraction';
import { proposeFollowups } from '@/lib/services/followup-proposal-service';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';
import { validateAliasesDiagnostic } from '@/lib/services/query-expansion-service';
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

/** Per-window retrieval depth is capped at the reranker/prompt scale. */
const MAX_WINDOW_DEPTH = 60;
/** Final-pool slots reserved for follow-up arm hits (when any exist). */
const FOLLOWUP_SLOTS = 15;
/** Sharpest follow-up arms kept, rarest corpus footprint first. */
const MAX_FOLLOWUP_ARMS = 12;

export interface LoopRetrievalParams {
  query: string;
  dateFrom: string | undefined;
  dateTo: string | undefined;
  tier: ResearchTierFilter;
  inferredFrom: string | null;
}

interface LoopWindow {
  key: string;
  from: string | undefined;
  to: string | undefined;
}

/** Undated questions get a dedicated current-term stratum (#756). */
function loopWindows(p: LoopRetrievalParams): LoopWindow[] {
  if (p.dateFrom || p.dateTo) return [{ key: 'window', from: p.dateFrom, to: p.dateTo }];
  return [
    { key: 'full', from: undefined, to: undefined },
    { key: 'current_term', from: ERA_WINDOWS.trump_t2.from, to: undefined },
  ];
}

/** Follow-up phrases the pool searches have not already run, sharpest
 *  (rarest corpus footprint) first. */
async function validateNovelFollowups(
  phrases: string[],
  searched: ValidatedAlias[],
  p: LoopRetrievalParams,
): Promise<ValidatedAlias[]> {
  const known = new Set(searched.map((a) => a.phrase.toLowerCase()));
  const novel = phrases.filter((ph) => !known.has(ph.toLowerCase()));
  if (novel.length === 0) return [];
  const { validated } = await validateAliasesDiagnostic(novel, {
    dateFrom: p.dateFrom,
    dateTo: p.dateTo,
    tier: p.tier === 'all' ? undefined : p.tier,
  });
  return validated.sort((a, b) => a.matches - b.matches);
}

/** Both read channels (LLM deep-read + regex mining over the fused seed
 *  pool), merged sharpest-first and capped. */
async function readFollowups(
  p: LoopRetrievalParams,
  seedDocs: ResearchDocument[],
  alreadySearched: ValidatedAlias[],
): Promise<ValidatedAlias[]> {
  const [llmFollowups, minedFused] = await Promise.all([
    proposeFollowups(p.query, seedDocs).then((phrases) =>
      validateNovelFollowups(phrases, alreadySearched, p),
    ),
    mineEntityAliases(
      seedDocs.map((d) => d.id),
      alreadySearched,
      {
        dateFrom: p.dateFrom,
        dateTo: p.dateTo,
        tier: p.tier === 'all' ? undefined : p.tier,
      },
    ).catch(() => [] as ValidatedAlias[]),
  ]);
  return mergeSearchedTerms(llmFollowups, minedFused)
    .sort((a, b) => a.matches - b.matches)
    .slice(0, MAX_FOLLOWUP_ARMS);
}

/** Hydrate the follow-up arms' hits into a ranked doc pool: round-robin
 *  across arms (each arm's best hits first) so one broad arm cannot claim
 *  every reserved slot. */
async function hydrateFollowupPool(
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

function toPools(pools: ResearchDocument[][], slots: number) {
  return pools.map((docs) => ({
    kept: docs.slice(0, slots),
    overflow: docs.slice(slots),
  }));
}

/** Seed pass: per-window hybrid retrieval (vector + LLM arms + PRF mining). */
async function runSeedPass(
  p: LoopRetrievalParams,
  windows: LoopWindow[],
  depth: number,
  timings: WindowTiming[],
) {
  const seed = await Promise.all(
    windows.map(async (w) => {
      const s0 = Date.now();
      const result = await searchResearchWithMeta(p.query, depth, undefined, w.from, w.to, p.tier);
      timings.push({ key: `seed:${w.key}`, searchMs: Date.now() - s0, rerankMs: 0 });
      return result;
    }),
  );
  return {
    seedPools: seed.map((s) => s.documents),
    seedMined: seed.reduce<ValidatedAlias[]>(
      (acc, s) => mergeSearchedTerms(acc, s.minedAliases),
      [],
    ),
  };
}

/** Reserve FOLLOWUP_SLOTS for the follow-up pool; without one, the seed
 *  composition stands. */
function composeWithFollowups(
  seedPools: ResearchDocument[][],
  seedDocs: ResearchDocument[],
  followupPool: ResearchDocument[],
  contextDocs: number,
  windowCount: number,
): ResearchDocument[] {
  if (followupPool.length === 0) return seedDocs;
  return composeAspectPools(
    [
      ...toPools(seedPools, Math.floor((contextDocs - FOLLOWUP_SLOTS) / windowCount)),
      {
        kept: followupPool.slice(0, FOLLOWUP_SLOTS),
        overflow: followupPool.slice(FOLLOWUP_SLOTS),
      },
    ],
    contextDocs,
  ).docs;
}

/**
 * Seed → read → follow-up slots → compose. Degrades gracefully: an empty
 * read step composes the seed windows exactly as before.
 */
export async function retrieveEnumerationLoop(
  p: LoopRetrievalParams,
  contextDocs: number,
  debug?: boolean,
): Promise<RetrievalResult> {
  const t0 = Date.now();
  const windows = loopWindows(p);
  const seedSlots = Math.floor(contextDocs / windows.length);
  const depth = Math.min(MAX_WINDOW_DEPTH, seedSlots * 2);

  const timings: WindowTiming[] = [];
  const seedStart = Date.now();
  const { seedPools, seedMined } = await runSeedPass(p, windows, depth, timings);
  const seedDocs = composeAspectPools(toPools(seedPools, seedSlots), contextDocs).docs;

  // Read step: what does the pool mention that it does not contain?
  const readStart = Date.now();
  const expansionTerms = await collectAlsoSearched(
    p.query,
    windows.map((w) => ({ from: w.from, to: w.to })),
    p.tier,
  );
  const alreadySearched = mergeSearchedTerms(expansionTerms, seedMined);
  const followups = await readFollowups(p, seedDocs, alreadySearched);
  const readMs = Date.now() - readStart;

  // Follow-up arms → guaranteed slots (see module doc for why not fusion).
  const armStart = Date.now();
  const arms = followups.length ? await runArmsForAliases(followups, p.dateFrom, p.dateTo) : [];
  const seedIds = new Set(seedDocs.map((d) => d.id));
  const followupPool = await hydrateFollowupPool(arms, seedIds, FOLLOWUP_SLOTS * 2);
  timings.push({ key: 'followup:arms', searchMs: Date.now() - armStart, rerankMs: 0 });

  const docs = composeWithFollowups(seedPools, seedDocs, followupPool, contextDocs, windows.length);

  return {
    docs,
    strata: null,
    inferredFrom: p.inferredFrom,
    alsoSearched: mergeSearchedTerms(alreadySearched, followups),
    timings: {
      expansionMs: readMs,
      retrieveWallMs: Date.now() - seedStart - readMs,
      windows: timings,
      totalMs: Date.now() - t0,
    },
    ...(debug
      ? { candidates: [...seedPools.flat(), ...followupPool].map((d) => toCandidateSummary(d)) }
      : {}),
  };
}
