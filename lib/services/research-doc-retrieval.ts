/**
 * Research document retrieval orchestration (#552/#592/#707 — relocated from
 * the /api/search route file): tiered retrieval with the request's date +
 * tier params, era stratification for comparative questions (each era
 * competes only with itself, so the recency-dense current term cannot crowd
 * out the eras being compared), tier-balanced re-rank, and "also searched"
 * chip collection.
 */

import type { NextApiRequest } from 'next';
import type { EraWindow } from '@/lib/services/era-extraction';
import {
  ERA_WINDOWS,
  extractComparisonEras,
  extractDateFloor,
} from '@/lib/services/era-extraction';
import { expandAndValidate } from '@/lib/services/query-expansion-service';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';
import { rerankByRelevance, rerankTierBalanced } from '@/lib/services/relevance-rerank';
import type { RetrievalStratum } from '@/lib/services/search-response-types';
import type { ResearchDocument, ResearchTierFilter } from '@/lib/services/search-service';
import { searchResearch } from '@/lib/services/search-service';

/** Docs sent to the synthesis LLM. */
export const RESEARCH_CONTEXT_DOCS = 30;

/** Intersect user date bounds with each era window; an empty intersection
 *  falls back to the full era and is flagged rather than silently dropped. */
function intersectEraWindows(eras: EraWindow[], dateFrom?: string, dateTo?: string) {
  return eras.map((era) => {
    const from = dateFrom && dateFrom > era.from ? dateFrom : era.from;
    const to = dateTo && (!era.to || dateTo < era.to) ? dateTo : era.to;
    const dateConflict = Boolean(to && from > to);
    return dateConflict
      ? { era, from: era.from, to: era.to, dateConflict }
      : { era, from, to, dateConflict };
  });
}

/** Corpus-validated aliases (phrase + corpus match count) for the windows
 *  searched (#702, counts #713) — cache hits, since searchResearch already
 *  ran the same expansion internally. Multi-window merges keep the max count. */
async function collectAlsoSearched(
  query: string,
  windows: Array<{ from?: string; to?: string }>,
  tier: ResearchTierFilter,
): Promise<ValidatedAlias[]> {
  const byPhrase = new Map<string, number>();
  for (const w of windows) {
    const aliases = await expandAndValidate(query, {
      dateFrom: w.from,
      dateTo: w.to,
      tier: tier === 'all' ? undefined : tier,
    });
    for (const a of aliases) {
      byPhrase.set(a.phrase, Math.max(byPhrase.get(a.phrase) ?? 0, a.matches));
    }
  }
  return [...byPhrase].map(([phrase, matches]) => ({ phrase, matches }));
}

/** Tier balance survives the re-rank on mixed-tier retrievals (#707). */
function rerankForTier(
  query: string,
  candidates: ResearchDocument[],
  keep: number,
  tier: ResearchTierFilter,
): Promise<ResearchDocument[]> {
  return tier === 'all'
    ? rerankTierBalanced(query, candidates, keep)
    : rerankByRelevance(query, candidates, keep);
}

/** Non-comparative path: one window, full context allocation. */
async function retrieveSingleWindow(
  query: string,
  embedding: number[],
  w: EraWindow | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  tier: ResearchTierFilter,
  inferredFrom: string | null,
) {
  const candidates = await searchResearch(
    query,
    RESEARCH_CONTEXT_DOCS * 2,
    embedding,
    w ? w.from : dateFrom,
    w ? w.to : dateTo,
    tier,
  );
  const docs = await rerankForTier(query, candidates, RESEARCH_CONTEXT_DOCS, tier);
  const alsoSearched = await collectAlsoSearched(
    query,
    [w ? { from: w.from, to: w.to } : { from: dateFrom, to: dateTo }],
    tier,
  );
  return { docs, strata: null as RetrievalStratum[] | null, inferredFrom, alsoSearched };
}

export async function retrieveResearchDocs(
  req: NextApiRequest,
  query: string,
  embedding: number[],
): Promise<{
  docs: ResearchDocument[];
  strata: RetrievalStratum[] | null;
  inferredFrom: string | null;
  alsoSearched: ValidatedAlias[];
}> {
  // Range phrases in the question ("since January 2025") become a date floor
  // when the user has not set explicit dates; surfaced in the response so
  // the page can show what was inferred.
  const inferredFrom = !req.query.dateFrom ? extractDateFloor(query) : null;
  const dateFrom = (req.query.dateFrom as string | undefined) ?? inferredFrom ?? undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const tier = (req.query.tier as ResearchTierFilter | undefined) ?? 'all';

  // Chips UI override (#592): eras=trump_t1,trump_t2 pins the strata after
  // the user removes one; a single remaining era degrades to a plain
  // date-windowed retrieval.
  const eraParam = req.query.eras as string | undefined;
  const requested = eraParam
    ? eraParam
        .split(',')
        .map((k) => ERA_WINDOWS[k as keyof typeof ERA_WINDOWS])
        .filter(Boolean)
    : null;
  const eras = requested && requested.length > 0 ? requested : extractComparisonEras(query);
  if (!eras || eras.length < 2) {
    return retrieveSingleWindow(query, embedding, eras?.[0], dateFrom, dateTo, tier, inferredFrom);
  }

  const slots = Math.floor(RESEARCH_CONTEXT_DOCS / eras.length);
  const windows = intersectEraWindows(eras, dateFrom, dateTo);
  const perEra = await Promise.all(
    windows.map(async (w) => {
      const candidates = await searchResearch(query, slots * 2, embedding, w.from, w.to, tier);
      return rerankForTier(query, candidates, slots, tier);
    }),
  );
  const strata: RetrievalStratum[] = windows.map((w, i) => ({
    key: w.era.key,
    label: w.era.label,
    from: w.from,
    to: w.to,
    docCount: perEra[i].length,
    ...(w.dateConflict ? { dateConflict: true } : {}),
  }));
  const alsoSearched = await collectAlsoSearched(query, windows, tier);
  return { docs: perEra.flat(), strata, inferredFrom, alsoSearched };
}
