/**
 * R-TIPWIRE matching (#855): one article → the corpus documents most likely
 * to hold a tip, plus the structural context the judge sees.
 *
 * Uses the pure library retrieval path (no HTTP, no Turnstile/token, no spend
 * admission): embed → searchResearchWithMeta (60) → rerankForTier (20) →
 * soft category prior → top 10 → ts_headline passages. This is byte-identical
 * to the served "analytical" path minus the orchestrator. ≈ $0.004/article.
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
/** Window of corpus documents considered, ending the day after the article. */
export const WINDOW_DAYS = 84;
/** Soft prior: fraction of the best score added to docs in the reporter's categories. */
export const CATEGORY_PRIOR_WEIGHT = 0.15;

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
  window: { from: string; to: string };
  docs: RankedDoc[];
  structural: StructuralLine[];
  meta: {
    retrieved: number;
    reranked: number;
    boosted: number;
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

/** Retrieval window: `WINDOW_DAYS` before the article to the day after it. */
export function retrievalWindow(
  publishedAt: string | null,
  now: Date,
): { from: string; to: string } {
  const end = publishedAt ? new Date(publishedAt) : now;
  const to = new Date(end.getTime() + ONE_DAY_MS);
  const from = new Date(end.getTime() - WINDOW_DAYS * ONE_DAY_MS);
  return { from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10) };
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

/** One line per roster category for the article's week — or the latest
 *  aggregated week before it when that week has not been computed yet
 *  (mid-week articles; a stale dev database). The line carries its own
 *  weekOf so the judge sees which week it describes. */
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

/** Retrieve, rerank, boost, trim, and annotate the docs for one article. */
export async function retrieveForArticle(
  article: DiscoveredArticle,
  reporter: ReporterEntry,
  deps: Partial<MatchDeps> = {},
): Promise<MatchResult> {
  const d = { ...defaultDeps(), ...deps };
  const { query, mode } = buildQuery(article, reporter);
  const window = retrievalWindow(article.publishedAt, d.now);
  const started = Date.now();

  const { docs, minedAliases, reranked } = await withRequestDbGate(1, async () => {
    const emb = (await d.embed(query)) ?? undefined;
    const { documents, minedAliases } = await d.search(
      query,
      RETRIEVAL_TOP_K,
      emb,
      window.from,
      window.to,
    );
    const reranked = documents.length > 0 ? await d.rerank(query, documents, RERANK_KEEP) : [];
    const boosted = applyCategoryPrior(reranked, reporter.categories).slice(0, PROMPT_DOCS);
    await d.enrich(boosted, query);
    return { docs: boosted, minedAliases: minedAliases.length, reranked: reranked.length };
  });

  const weekOf = getMonday(article.publishedAt ? new Date(article.publishedAt) : d.now);
  const structural = await d.structural(reporter.categories, weekOf);

  return {
    query,
    queryMode: mode,
    window,
    docs,
    structural,
    meta: {
      retrieved: reranked === 0 ? 0 : Math.max(reranked, docs.length),
      reranked,
      boosted: docs.filter((x) => x.priorBoosted).length,
      minedAliases,
      retrievalMs: Date.now() - started,
    },
  };
}
