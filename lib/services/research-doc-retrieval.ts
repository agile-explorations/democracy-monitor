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

export async function retrieveResearchDocs(
  req: NextApiRequest,
  query: string,
  embedding: number[],
  debug?: boolean,
): Promise<RetrievalResult> {
  // Range phrases in the question ("since January 2025") become a date floor
  // when the user has not set explicit dates; surfaced in the response so
  // the page can show what was inferred.
  const inferredFrom = !req.query.dateFrom ? extractDateFloor(query) : null;
  const dateFrom = (req.query.dateFrom as string | undefined) ?? inferredFrom ?? undefined;
  const dateTo = req.query.dateTo as string | undefined;
  const tier = (req.query.tier as ResearchTierFilter | undefined) ?? 'all';
  const budget = budgetForQuestion(query);
  const eras = resolveEras(req, query);
  if (eras && eras.length >= 2) {
    return retrieveEraStratified(
      { query, embedding, eras, dateFrom, dateTo, tier, inferredFrom },
      budget.contextDocs,
      // Era-window salience arms (#760) only on the enumeration budget —
      // the analytical path stays byte-identical to v1.10.1 semantics.
      budget.mode === 'enumeration',
      debug,
    );
  }

  // Enumeration questions (#758): single seed sweep + salience arms from
  // the hot-entity index into guaranteed slots. A single remaining era chip
  // narrows the window like the single path does.
  if (budget.mode === 'enumeration') {
    const w = eras?.[0];
    return retrieveEnumerationLoop(
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
    );
  }

  return retrieveSingleWindow(
    query,
    embedding,
    eras?.[0],
    dateFrom,
    dateTo,
    tier,
    inferredFrom,
    budget.contextDocs,
    debug,
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
  const s0 = Date.now();
  const { documents: candidates, minedAliases } = await searchResearchWithMeta(
    p.query,
    slots * 2,
    p.embedding,
    w.from,
    w.to,
    p.tier,
  );
  sinks.eraMined.push(...minedAliases);
  const searchMs = Date.now() - s0;
  if (sinks.debugCandidates) {
    sinks.debugCandidates.push(...candidates.map((d) => toCandidateSummary(d, w.era.key)));
  }
  const r0 = Date.now();
  let docs = await rerankForTier(p.query, candidates, slots, p.tier);
  if (salience) {
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
  }
  sinks.windowTimings.push({ key: w.era.key, searchMs, rerankMs: Date.now() - r0 });
  return docs;
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
  // Expansion first (#726): warms the per-window alias caches so the window
  // searches below hit them — the timings then cleanly separate API-bound
  // expansion from database-bound retrieval.
  const alsoSearched = await collectAlsoSearched(p.query, windows, p.tier);
  const expansionMs = Date.now() - t0;
  const debugCandidates: ReturnType<typeof toCandidateSummary>[] = [];
  const windowTimings: WindowTiming[] = [];
  const tRetrieve = Date.now();
  const eraMined: ValidatedAlias[] = [];
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
  const strata: RetrievalStratum[] = windows.map((w, i) => ({
    key: w.era.key,
    label: w.era.label,
    from: w.from,
    to: w.to,
    docCount: perEra[i].length,
    ...(w.dateConflict ? { dateConflict: true } : {}),
  }));
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
