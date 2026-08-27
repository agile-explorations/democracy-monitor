/**
 * Shared helpers for the research retrieval orchestrators (#753): the
 * single-window/era path (research-doc-retrieval.ts) and the
 * aspect-stratified path (research-aspect-retrieval.ts) both consume these.
 */

import type { CacheStats } from '@/lib/services/db-work-gate';
import { expandAndValidate } from '@/lib/services/query-expansion-service';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';
import { rerankByRelevance, rerankTierBalanced } from '@/lib/services/relevance-rerank';
import type { RetrievalStratum } from '@/lib/services/search-response-types';
import type { ResearchDocument, ResearchTierFilter } from '@/lib/services/search-service';

/** Corpus-validated aliases (phrase + corpus match count) for the windows
 *  searched (#702, counts #713). Runs BEFORE the seed sweep, one window at
 *  a time: validation counts are CPU-bound on the DB tier and measured
 *  slower in parallel than in series (#782 WO-5). The seed then derives the
 *  same expansion as a cache hit (or joins the in-flight one). Multi-window
 *  merges keep window order and the max count. */
export async function collectAlsoSearched(
  query: string,
  windows: Array<{ from?: string; to?: string }>,
  tier: ResearchTierFilter,
): Promise<ValidatedAlias[]> {
  const perWindow: ValidatedAlias[][] = [];
  for (const w of windows) {
    perWindow.push(
      await expandAndValidate(query, {
        dateFrom: w.from,
        dateTo: w.to,
        tier: tier === 'all' ? undefined : tier,
      }),
    );
  }
  const byPhrase = new Map<string, number>();
  for (const aliases of perWindow) {
    for (const a of aliases) {
      byPhrase.set(a.phrase, Math.max(byPhrase.get(a.phrase) ?? 0, a.matches));
    }
  }
  return [...byPhrase].map(([phrase, matches]) => ({ phrase, matches }));
}

/** Merge corpus-mined aliases (#750) into the searched-terms list so the
 *  transparency chips, synthesis prompt, and quote-verifier exemptions all
 *  see them alongside the LLM-proposed terms. */
export function mergeSearchedTerms(
  base: ValidatedAlias[],
  mined: ValidatedAlias[],
): ValidatedAlias[] {
  const seen = new Set(base.map((a) => a.phrase.toLowerCase()));
  return [...base, ...mined.filter((m) => !seen.has(m.phrase.toLowerCase()))];
}

/** Tier balance survives the re-rank on mixed-tier retrievals (#707). */
export function rerankForTier(
  query: string,
  candidates: ResearchDocument[],
  keep: number,
  tier: ResearchTierFilter,
): Promise<ResearchDocument[]> {
  return tier === 'all'
    ? rerankTierBalanced(query, candidates, keep)
    : rerankByRelevance(query, candidates, keep);
}

/** Per-window phase timings for the payload's `timings` object (#726). */
export interface WindowTiming {
  key: string;
  searchMs: number;
  rerankMs: number;
}

/** Phase breakdown of one docsOnly retrieval build (#726): expansion runs
 *  FIRST (warming its caches) so the window searches below are ~pure DB
 *  work — separating external-API-bound from database-bound time. The
 *  seed's `seed-expansion` row then records the cache hit. */
export interface RetrievalTimings {
  expansionMs: number;
  /** Wall-clock of the (parallel) window retrieval block. */
  retrieveWallMs: number;
  windows: WindowTiming[];
  totalMs: number;
  /** Arm / validation-count cache tally for this build (#787). */
  cacheStats?: CacheStats;
}

/** Light pre-rerank candidate shape for the debug trace (#718). */
export interface CandidateSummary {
  id: number;
  title: string;
  sourceType: string | null;
  tier: string;
  publishedAt: string | null;
  cosineSimilarity: number;
  matchedAlias?: string;
  era?: string;
}

export function toCandidateSummary(d: ResearchDocument, era?: string): CandidateSummary {
  return {
    id: d.id,
    title: d.title,
    sourceType: d.sourceType,
    tier: d.tier,
    publishedAt: d.publishedAt,
    cosineSimilarity: d.cosineSimilarity,
    ...(d.matchedAlias ? { matchedAlias: d.matchedAlias } : {}),
    ...(era ? { era } : {}),
  };
}

export interface RetrievalResult {
  docs: ResearchDocument[];
  strata: RetrievalStratum[] | null;
  inferredFrom: string | null;
  alsoSearched: ValidatedAlias[];
  timings: RetrievalTimings;
  candidates?: CandidateSummary[];
}
