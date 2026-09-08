/**
 * R-TIPWIRE matching (#855, #862): one article → the corpus documents most
 * likely to hold a tip, plus the structural context the judge sees.
 *
 * Uses the pure library retrieval path (no HTTP, no Turnstile/token, no spend
 * admission): embed → searchResearchWithMeta (60) → rerankForTier (20) →
 * soft category prior → top 10 → ts_headline passages. ≈ $0.004/article.
 *
 * Two retrieval scopes (R-TIPWIRE-2 pivot, owner decision 2026-09-07):
 * - `forward` (steady state): documents published AFTER the article — since
 *   the previous check when the article is a standing watch. "Since your
 *   piece on X, this appeared in the record."
 * - `contradiction` (reactive articles only, once): documents predating the
 *   article, judged for whether any contradicts it.
 *
 * The beat→category prior is a BOOST, never a filter: the best tip may sit
 * in a cross-category document, which is the corpus's differentiator.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { withRequestDbGate } from '@/lib/services/db-work-gate';
import { embedText } from '@/lib/services/embedding-service';
import { rerankForTier } from '@/lib/services/research-retrieval-helpers';
import { searchResearchWithMeta } from '@/lib/services/search-service';
import { enrichDocsForSynthesis } from '@/lib/services/synthesis-context-enrichment';
import type { ResearchDocument } from '@/lib/types/search';
import { ONE_DAY_MS, getMonday } from '@/lib/utils/date-utils';
import type { DiscoveredArticle } from './acquire';
import { categoryLabels } from './roster';
import type { CategoryKey, ReporterEntry } from './roster';

export const RETRIEVAL_TOP_K = 60;
export const RERANK_KEEP = 20;
export const PROMPT_DOCS = 10;
/** Contradiction scope: corpus documents this many days before the article. */
export const WINDOW_DAYS = 84;
/** How long an article stays a standing forward watch. */
export const WATCH_DAYS = 21;
/** Soft prior: rank-fraction added to docs in the reporter's categories. */
export const CATEGORY_PRIOR_WEIGHT = 0.15;

export type WatchKind = 'forward' | 'contradiction' | 'beat';

export interface RetrievalScope {
  kind: WatchKind;
  /** Forward only: resume from here (the previous check) instead of the article date. */
  since?: string | null;
  /** Documents already cited for this article — never re-proposed. */
  excludeDocIds?: readonly number[];
  /** Beat only: the pre-selected Pass 2 documents, best first (see ./beat-docs). */
  docIds?: readonly number[];
  /** Beat only: the beat week (Monday) the check is attributed to. */
  weekOf?: string;
  /** Beat only (R-TIPWIRE-4): the category the check ran on. */
  category?: CategoryKey;
  /** Beat only (R-TIPWIRE-4): every reporter on the beat; the anchor's reporter is the first. */
  reporterIds?: readonly string[];
}

export interface RankedDoc extends ResearchDocument {
  priorBoosted: boolean;
  matchScore: number;
}

export interface StructuralLine {
  category: CategoryKey;
  weekOf: string;
  status: string | null;
  documentCount: number | null;
  actionConfirmed: number | null;
  discussionConfirmed: number | null;
  silenceElevated: boolean | null;
}

export interface MatchResult {
  query: string;
  queryMode: 'title+lede' | 'title+categories';
  kind: WatchKind;
  window: { from: string; to: string };
  docs: RankedDoc[];
  structural: StructuralLine[];
  meta: {
    retrieved: number;
    reranked: number;
    boosted: number;
    excluded: number;
    minedAliases: number;
    retrievalMs: number;
  };
}

// ---------------------------------------------------------------------------
// Pure
// ---------------------------------------------------------------------------

/** Title + lede; without a lede, title + the beat's category names. */
export function buildQuery(
  article: Pick<DiscoveredArticle, 'title' | 'lede'>,
  reporter: Pick<ReporterEntry, 'categories'>,
): { query: string; mode: MatchResult['queryMode'] } {
  if (article.lede) return { query: `${article.title} — ${article.lede}`, mode: 'title+lede' };
  const labels = categoryLabels(reporter.categories).join(', ');
  return {
    query: labels ? `${article.title} (${labels})` : article.title,
    mode: 'title+categories',
  };
}

const day = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Retrieval window by scope.
 * - forward: [max(article date, since) → tomorrow] — the record since the piece (or since the last check).
 * - contradiction: [article − WINDOW_DAYS → article date] — what predates the piece.
 * Undated articles: forward from `since` or discovery-now; contradiction ends today.
 */
export function retrievalWindow(
  publishedAt: string | null,
  now: Date,
  scope: RetrievalScope = { kind: 'forward' },
): { from: string; to: string } {
  const published = publishedAt ? new Date(publishedAt) : now;
  if (scope.kind === 'beat') {
    const week = new Date(scope.weekOf ?? getMonday(now));
    return { from: day(week), to: day(new Date(week.getTime() + 7 * ONE_DAY_MS)) };
  }
  if (scope.kind === 'contradiction') {
    return {
      from: day(new Date(published.getTime() - WINDOW_DAYS * ONE_DAY_MS)),
      to: day(published),
    };
  }
  const since = scope.since ? new Date(scope.since) : null;
  const start = since && since > published ? since : published;
  return { from: day(start), to: day(new Date(now.getTime() + ONE_DAY_MS)) };
}

/** Watch expiry for a stored article; null when the article is undated. */
export function watchUntil(publishedAt: string | null): Date | null {
  return publishedAt ? new Date(new Date(publishedAt).getTime() + WATCH_DAYS * ONE_DAY_MS) : null;
}

/**
 * Soft category prior over an already-ranked list. The input order (the
 * reranker's) is the signal: each doc's base score is its rank position
 * scaled to (0, 1], and docs in the prior categories gain `weight` — so at
 * 0.15 a prior doc climbs about 1.5 places in a list of 10, never more.
 * Reranked docs carry no comparable numeric score, which is why rank, not
 * `finalScore`, is the base. Never drops a doc; weight 0 is the identity.
 */
export function applyCategoryPrior(
  docs: ResearchDocument[],
  priors: readonly string[],
  weight: number = CATEGORY_PRIOR_WEIGHT,
): RankedDoc[] {
  const n = docs.length;
  const prior = new Set(priors);
  return docs
    .map((d, i) => {
      const priorBoosted = prior.has(d.category);
      const matchScore = (n - i) / n + (priorBoosted ? weight : 0);
      return { ...d, priorBoosted, matchScore, i };
    })
    .sort((a, b) => b.matchScore - a.matchScore || a.i - b.i)
    .map(({ i: _i, ...d }) => d);
}

// ---------------------------------------------------------------------------
// I/O
// ---------------------------------------------------------------------------

export interface MatchDeps {
  embed: (q: string) => Promise<number[] | null>;
  search: (
    q: string,
    topK: number,
    emb: number[] | undefined,
    from: string,
    to: string,
  ) => Promise<{ documents: ResearchDocument[]; minedAliases: unknown[] }>;
  rerank: (q: string, docs: ResearchDocument[], keep: number) => Promise<ResearchDocument[]>;
  enrich: (docs: ResearchDocument[], q: string) => Promise<void>;
  structural: (categories: CategoryKey[], weekOf: string) => Promise<StructuralLine[]>;
  /** Beat scope: load the pre-selected documents (see ./match-beat). */
  byIds?: (ids: number[]) => Promise<ResearchDocument[]>;
  now: Date;
}

const defaultDeps = (): MatchDeps => ({
  embed: embedText,
  search: (q, topK, emb, from, to) => searchResearchWithMeta(q, topK, emb, from, to, 'all'),
  rerank: (q, docs, keep) => rerankForTier(q, docs, keep, 'all'),
  enrich: enrichDocsForSynthesis,
  structural: fetchStructuralLines,
  now: new Date(),
});

interface StructuralRow {
  category: string;
  week_of: string;
  status: string | null;
  document_count: number | null;
  action_confirmed: number | null;
  discussion_confirmed: number | null;
  silence_elevated: boolean | null;
}

/** One line per roster category for the given week — or the latest
 *  aggregated week before it when that week has not been computed yet. */
export async function fetchStructuralLines(
  categories: CategoryKey[],
  weekOf: string,
): Promise<StructuralLine[]> {
  if (!isDbAvailable() || categories.length === 0) return [];
  const db = getDb();
  const categoryList = sql.join(
    categories.map((c) => sql`${c}`),
    sql`, `,
  );
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (category) category, week_of,
      convergence_detail->>'status' AS status,
      document_count,
      (convergence_detail->'evidenceMix'->>'actionConfirmed')::int AS action_confirmed,
      (convergence_detail->'evidenceMix'->>'discussionConfirmed')::int AS discussion_confirmed,
      (convergence_detail->>'silenceElevated')::boolean AS silence_elevated
    FROM weekly_aggregates
    WHERE week_of <= ${weekOf} AND category IN (${categoryList})
    ORDER BY category, week_of DESC`);
  return (rows.rows as unknown as StructuralRow[]).map((r) => ({
    category: r.category as CategoryKey,
    weekOf: String(r.week_of).slice(0, 10),
    status: r.status,
    documentCount: r.document_count,
    actionConfirmed: r.action_confirmed,
    discussionConfirmed: r.discussion_confirmed,
    silenceElevated: r.silence_elevated,
  }));
}

/** Forward watches describe the record now; contradiction checks the article's week. */
function structuralWeek(article: DiscoveredArticle, scope: RetrievalScope, now: Date): string {
  if (scope.kind === 'beat' && scope.weekOf) return scope.weekOf;
  const anchor =
    scope.kind === 'forward' || !article.publishedAt ? now : new Date(article.publishedAt);
  return getMonday(anchor);
}

/** Retrieve, rerank, boost, trim, and annotate the docs for one article under a scope. */
export async function retrieveForArticle(
  article: DiscoveredArticle,
  reporter: ReporterEntry,
  deps: Partial<MatchDeps> = {},
  scope: RetrievalScope = { kind: 'forward' },
): Promise<MatchResult> {
  const d = { ...defaultDeps(), ...deps };
  const { query, mode } = buildQuery(article, reporter);
  const window = retrievalWindow(article.publishedAt, d.now, scope);
  const exclude = new Set(scope.excludeDocIds ?? []);
  const started = Date.now();

  const { docs, minedAliases, reranked, excluded } = await withRequestDbGate(1, async () => {
    const emb = (await d.embed(query)) ?? undefined;
    const { documents, minedAliases } = await d.search(
      query,
      RETRIEVAL_TOP_K,
      emb,
      window.from,
      window.to,
    );
    const fresh = documents.filter((x) => !exclude.has(x.id));
    const reranked = fresh.length > 0 ? await d.rerank(query, fresh, RERANK_KEEP) : [];
    const boosted = applyCategoryPrior(reranked, reporter.categories).slice(0, PROMPT_DOCS);
    await d.enrich(boosted, query);
    return {
      docs: boosted,
      minedAliases: minedAliases.length,
      reranked: reranked.length,
      excluded: documents.length - fresh.length,
    };
  });

  const structural = await d.structural(reporter.categories, structuralWeek(article, scope, d.now));

  return {
    query,
    queryMode: mode,
    kind: scope.kind,
    window,
    docs,
    structural,
    meta: {
      retrieved: reranked === 0 ? 0 : Math.max(reranked, docs.length),
      reranked,
      boosted: docs.filter((x) => x.priorBoosted).length,
      excluded,
      minedAliases,
      retrievalMs: Date.now() - started,
    },
  };
}
