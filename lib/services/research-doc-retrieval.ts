/**
 * Research document retrieval orchestration (#552/#592/#707 — relocated from
 * the /api/search route file): tiered retrieval with the request's date +
 * tier params, era stratification for comparative questions (each era
 * competes only with itself, so the recency-dense current term cannot crowd
 * out the eras being compared), salience-armed enumeration retrieval (#758
 * — research-loop-retrieval.ts), tier-balanced re-rank, and "also searched"
 * chip collection.
 */

import type { NextApiRequest } from 'next';
import { requestCacheStats, withRequestDbGate } from '@/lib/services/db-work-gate';
import { ENUM_EXTRACTION } from '@/lib/services/entity-extraction';
import type { EraWindow } from '@/lib/services/era-extraction';
import {
  ERA_WINDOWS,
  extractComparisonEras,
  extractDateFloor,
} from '@/lib/services/era-extraction';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';
import { budgetForQuestion } from '@/lib/services/question-classifier';
import {
  applySalienceStage,
  retrieveEnumerationLoop,
} from '@/lib/services/research-loop-retrieval';
import type {
  RetrievalResult,
  RetrievalTimings,
  WindowTiming,
} from '@/lib/services/research-retrieval-helpers';
import {
  collectAlsoSearched,
  mergeSearchedTerms,
  rerankForTier,
  toCandidateSummary,
} from '@/lib/services/research-retrieval-helpers';
import type { RetrievalStratum } from '@/lib/services/search-response-types';
import type { ResearchDocument, ResearchTierFilter } from '@/lib/services/search-service';
import { searchResearchWithMeta } from '@/lib/services/search-service';

export type {
  CandidateSummary,
  RetrievalResult,
  RetrievalTimings,
  WindowTiming,
} from '@/lib/services/research-retrieval-helpers';

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

/** Non-comparative single-query path: one window, full context allocation. */
async function retrieveSingleWindow(
  query: string,
  embedding: number[],
  w: EraWindow | undefined,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  tier: ResearchTierFilter,
  inferredFrom: string | null,
  contextDocs: number,
  debug?: boolean,
): Promise<RetrievalResult> {
  const t0 = Date.now();
  // Expansion first (#726; re-confirmed by #782 WO-5): validation counts
  // run alone, then the seed hits their caches.
  const alsoSearched = await collectAlsoSearched(
    query,
    [w ? { from: w.from, to: w.to } : { from: dateFrom, to: dateTo }],
    tier,
  );
  const expansionMs = Date.now() - t0;
  const t1 = Date.now();
  const { documents: candidates, minedAliases } = await searchResearchWithMeta(
    query,
    contextDocs * 2,
    embedding,
    w ? w.from : dateFrom,
    w ? w.to : dateTo,
    tier,
  );
  const searchMs = Date.now() - t1;
  const t2 = Date.now();
  const docs = await rerankForTier(query, candidates, contextDocs, tier);
  const rerankMs = Date.now() - t2;
  return {
    docs,
    strata: null,
    inferredFrom,
    alsoSearched: mergeSearchedTerms(alsoSearched, minedAliases),
    timings: {
      expansionMs,
      retrieveWallMs: searchMs,
      windows: [{ key: w?.key ?? 'window', searchMs, rerankMs }],
      totalMs: Date.now() - t0,
    },
    ...(debug ? { candidates: candidates.map((d) => toCandidateSummary(d)) } : {}),
  };
}

/** Chips UI override (#592): eras=trump_t1,trump_t2 pins the strata after
 *  the user removes one; a single remaining era degrades to a plain
 *  date-windowed retrieval. */
function resolveEras(req: NextApiRequest, query: string): EraWindow[] | null {
  const eraParam = req.query.eras as string | undefined;
  const requested = eraParam
    ? eraParam
        .split(',')
        .map((k) => ERA_WINDOWS[k as keyof typeof ERA_WINDOWS])
        .filter(Boolean)
    : null;
  return requested && requested.length > 0 ? requested : extractComparisonEras(query);
}

/** Request → retrieval parameters. Range phrases in the question ("since
 *  January 2025") become a date floor when the user has not set explicit
 *  dates; surfaced in the response so the page can show what was inferred. */
function parseRetrievalRequest(req: NextApiRequest, query: string) {
  const inferredFrom = !req.query.dateFrom ? extractDateFloor(query) : null;
  return {
    inferredFrom,
    dateFrom: (req.query.dateFrom as string | undefined) ?? inferredFrom ?? undefined,
    dateTo: req.query.dateTo as string | undefined,
    tier: (req.query.tier as ResearchTierFilter | undefined) ?? 'all',
    budget: budgetForQuestion(query),
    eras: resolveEras(req, query),
  };
}

/** One DB budget per window (#782 WO-5) and one cache tally per build
 *  (#787), attached to the timings the payload and the ledger carry. */
function retrieveUnderBudget(
  windows: number,
  fn: () => Promise<RetrievalResult>,
): Promise<RetrievalResult> {
  return withRequestDbGate(windows, async () => {
    const result = await fn();
    return { ...result, timings: { ...result.timings, cacheStats: requestCacheStats() } };
  });
}

export async function retrieveResearchDocs(
  req: NextApiRequest,
  query: string,
  embedding: number[],
  debug?: boolean,
): Promise<RetrievalResult> {
  const { inferredFrom, dateFrom, dateTo, tier, budget, eras } = parseRetrievalRequest(req, query);
  if (eras && eras.length >= 2) {
    return retrieveUnderBudget(eras.length, () =>
      retrieveEraStratified(
        { query, embedding, eras, dateFrom, dateTo, tier, inferredFrom },
        budget.contextDocs,
        // Era-window salience arms (#760) only on the enumeration budget —
        // the analytical path stays byte-identical to v1.10.1 semantics.
        budget.mode === 'enumeration',
        debug,
      ),
    );
  }

  // Enumeration questions (#758): single seed sweep + salience arms from
  // the hot-entity index into guaranteed slots. A single remaining era chip
  // narrows the window like the single path does.
  const w = eras?.[0];
  if (budget.mode === 'enumeration') {
    return retrieveUnderBudget(1, () =>
      retrieveEnumerationLoop(
        {
          query,
          embedding,
          dateFrom: w ? w.from : dateFrom,
          dateTo: w ? w.to : dateTo,
          tier,
          inferredFrom,
        },
        budget.contextDocs,
        debug,
      ),
    );
  }

  return retrieveUnderBudget(1, () =>
    retrieveSingleWindow(
      query,
      embedding,
      w,
      dateFrom,
      dateTo,
      tier,
      inferredFrom,
      budget.contextDocs,
      debug,
    ),
  );
}

interface EraRetrievalParams {
  query: string;
  embedding: number[];
  eras: EraWindow[];
  dateFrom: string | undefined;
  dateTo: string | undefined;
  tier: ResearchTierFilter;
  inferredFrom: string | null;
}

/** Salience slots reserved inside each era window (#760). */
const ERA_SALIENCE_RESERVE_DIVISOR = 4;
const ERA_SALIENCE_RESERVE_MAX = 5;

/** One era window's seed sweep. Seed-internal stage rows (#782 WO-5) are
 *  era-prefixed so a comparative build's windows attribute separately
 *  instead of as one opaque row each. */
async function searchEraWindow(
  p: EraRetrievalParams,
  w: ReturnType<typeof intersectEraWindows>[number],
  slots: number,
  sinks: { eraMined: ValidatedAlias[]; windowTimings: WindowTiming[] },
) {
  const s0 = Date.now();
  const seedStages: WindowTiming[] = [];
  const { documents: candidates, minedAliases } = await searchResearchWithMeta(
    p.query,
    slots * 2,
    p.embedding,
    w.from,
    w.to,
    p.tier,
    undefined,
    undefined,
    seedStages,
  );
  sinks.eraMined.push(...minedAliases);
  sinks.windowTimings.push(...seedStages.map((s) => ({ ...s, key: `${w.era.key}:${s.key}` })));
  return { candidates, minedAliases, searchMs: Date.now() - s0 };
}

/** One era window's retrieve + rerank (+ optional era-scoped salience
 *  stage, #760), accumulating shared collectors. */
async function retrieveEraWindow(
  p: EraRetrievalParams,
  w: ReturnType<typeof intersectEraWindows>[number],
  slots: number,
  salience: boolean,
  sinks: {
    eraMined: ValidatedAlias[];
    windowTimings: WindowTiming[];
    debugCandidates: ReturnType<typeof toCandidateSummary>[] | null;
  },
): Promise<ResearchDocument[]> {
  const { candidates, minedAliases, searchMs } = await searchEraWindow(p, w, slots, sinks);
  if (sinks.debugCandidates) {
    sinks.debugCandidates.push(...candidates.map((d) => toCandidateSummary(d, w.era.key)));
  }
  const r0 = Date.now();
  let docs = await rerankForTier(p.query, candidates, slots, p.tier);
  const rerankMs = Date.now() - r0;
  if (salience) {
    // Salience (incl. the LLM judge) timed separately (#780 WP1): it was
    // silently charged to rerankMs, hiding the judge from attribution.
    const g0 = Date.now();
    const staged = await applySalienceStage({
      query: p.query,
      dateFrom: w.from,
      dateTo: w.to,
      era: w.era.key,
      docs,
      alreadySearched: minedAliases,
      reserve: Math.min(ERA_SALIENCE_RESERVE_MAX, Math.floor(slots / ERA_SALIENCE_RESERVE_DIVISOR)),
    });
    docs = staged.docs;
    sinks.eraMined.push(...staged.salience);
    sinks.windowTimings.push({
      key: `${w.era.key}-salience`,
      searchMs: Date.now() - g0,
      rerankMs: 0,
    });
  }
  sinks.windowTimings.push({ key: w.era.key, searchMs, rerankMs });
  return docs;
}

function buildStrata(
  windows: ReturnType<typeof intersectEraWindows>,
  perEra: ResearchDocument[][],
): RetrievalStratum[] {
  return windows.map((w, i) => ({
    key: w.era.key,
    label: w.era.label,
    from: w.from,
    to: w.to,
    docCount: perEra[i].length,
    ...(w.dateConflict ? { dateConflict: true } : {}),
  }));
}

/** Comparative path: each era competes only with itself for its slot share. */
async function retrieveEraStratified(
  p: EraRetrievalParams,
  contextDocs: number,
  salience: boolean,
  debug?: boolean,
): Promise<RetrievalResult> {
  const t0 = Date.now();
  const slots = Math.floor(contextDocs / p.eras.length);
  const windows = intersectEraWindows(p.eras, p.dateFrom, p.dateTo);
  // Expansion first (#726; re-confirmed by #782 WO-5): the per-window
  // validation counts run one window at a time, alone; the window searches
  // below then hit their caches and run side by side.
  const alsoSearched = await collectAlsoSearched(p.query, windows, p.tier);
  const expansionMs = Date.now() - t0;
  const debugCandidates: ReturnType<typeof toCandidateSummary>[] = [];
  const windowTimings: WindowTiming[] = [];
  const eraMined: ValidatedAlias[] = [];
  const tRetrieve = Date.now();
  const perEra = await Promise.all(
    windows.map((w) =>
      retrieveEraWindow(p, w, slots, salience, {
        eraMined,
        windowTimings,
        debugCandidates: debug ? debugCandidates : null,
      }),
    ),
  );
  const retrieveWallMs = Date.now() - tRetrieve;
  const strata = buildStrata(windows, perEra);
  const timings: RetrievalTimings = {
    expansionMs,
    retrieveWallMs,
    windows: windowTimings,
    totalMs: Date.now() - t0,
  };
  return {
    docs: perEra.flat(),
    strata,
    inferredFrom: p.inferredFrom,
    alsoSearched: mergeSearchedTerms(alsoSearched, eraMined),
    timings,
    ...(debug ? { candidates: debugCandidates } : {}),
  };
}
