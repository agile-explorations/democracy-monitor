/**
 * R-TIPWIRE per-article pipeline (#857, reused by the daily poll #858):
 * match → judge, under the shared AI-call budget. `assertAiCallBudget()` runs
 * OUTSIDE the per-article try/catch so a cap trip propagates (#564) instead
 * of degrading into a skipped article.
 */

import { assertAiCallBudget } from '@/lib/services/ai-call-budget';
import { formatError } from '@/lib/utils/api-helpers';
import { ONE_DAY_MS } from '@/lib/utils/date-utils';
import { isReactive } from './acquire';
import type { DiscoveredArticle } from './acquire';
import { judgeArticle } from './judge';
import type { JudgeDeps, JudgeResult } from './judge';
import { retrieveForArticle } from './match';
import type { MatchDeps, MatchResult, RankedDoc } from './match';
import { RECENT_TITLES_DAYS } from './prompt';
import type { ReporterEntry } from './roster';

export interface DocSummary {
  ref: number;
  id: number;
  title: string;
  category: string;
  tier: string;
  url: string | null;
  priorBoosted: boolean;
}

export interface PipelineItem {
  article: DiscoveredArticle;
  reporter: Pick<ReporterEntry, 'id' | 'name' | 'outlet'>;
  reactive: boolean;
  recentTitles: string[];
  match: Omit<MatchResult, 'docs'> & { docs: DocSummary[] };
  judge: JudgeResult;
}

export interface PipelineDeps {
  match?: Partial<MatchDeps>;
  judge?: JudgeDeps;
  now?: Date;
  /** Extra same-story titles beyond this batch (the poll reads stored history). */
  recentTitles?: (article: DiscoveredArticle) => Promise<string[]>;
  /** Progress sink (CLI prints; tests collect). */
  onItem?: (item: PipelineItem, index: number, total: number) => void;
}

/** The reporter's other titles within RECENT_TITLES_DAYS of this article. */
export function recentTitlesFor(article: DiscoveredArticle, all: DiscoveredArticle[]): string[] {
  const t0 = article.publishedAt ? new Date(article.publishedAt).getTime() : null;
  return all
    .filter((a) => a.reporterId === article.reporterId && a.articleKey !== article.articleKey)
    .filter((a) => {
      if (t0 === null || !a.publishedAt) return true;
      return Math.abs(new Date(a.publishedAt).getTime() - t0) <= RECENT_TITLES_DAYS * ONE_DAY_MS;
    })
    .map((a) => a.title);
}

function summarizeDocs(docs: RankedDoc[]): DocSummary[] {
  return docs.map((d, i) => ({
    ref: i + 1,
    id: d.id,
    title: d.title,
    category: d.category,
    tier: d.tier,
    url: d.url,
    priorBoosted: d.priorBoosted,
  }));
}

function errorItem(
  article: DiscoveredArticle,
  reporter: ReporterEntry,
  reactive: boolean,
  recentTitles: string[],
  err: unknown,
  now: Date,
): PipelineItem {
  return {
    article,
    reporter: { id: reporter.id, name: reporter.name, outlet: reporter.outlet },
    reactive,
    recentTitles,
    match: {
      query: '',
      queryMode: article.lede ? 'title+lede' : 'title+categories',
      window: { from: '', to: '' },
      docs: [],
      structural: [],
      meta: { retrieved: 0, reranked: 0, boosted: 0, minedAliases: 0, retrievalMs: 0 },
    },
    judge: {
      verdict: 'error',
      error: formatError(err),
      model: 'n/a',
      promptVersion: '',
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      calls: 0,
    },
  };
}

/** Match + judge every article, in order. Throws only on a budget trip. */
export async function runPipeline(
  articles: DiscoveredArticle[],
  reporters: Map<string, ReporterEntry>,
  deps: PipelineDeps = {},
): Promise<PipelineItem[]> {
  const now = deps.now ?? new Date();
  const items: PipelineItem[] = [];
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const reporter = reporters.get(article.reporterId);
    if (!reporter) continue;
    const reactive = isReactive(article.publishedAt, now);
    const stored = deps.recentTitles ? await deps.recentTitles(article) : [];
    const recentTitles = [
      ...new Set([
        ...recentTitlesFor(article, articles),
        ...stored.filter((t) => t !== article.title),
      ]),
    ];
    assertAiCallBudget();
    let item: PipelineItem;
    try {
      const match = await retrieveForArticle(article, reporter, { ...deps.match, now });
      const judge = await judgeArticle(
        { reporter, article, recentTitles, structural: match.structural, docs: match.docs },
        deps.judge,
      );
      item = {
        article,
        reporter: { id: reporter.id, name: reporter.name, outlet: reporter.outlet },
        reactive,
        recentTitles,
        match: { ...match, docs: summarizeDocs(match.docs) },
        judge,
      };
    } catch (err) {
      item = errorItem(article, reporter, reactive, recentTitles, err, now);
    }
    items.push(item);
    deps.onItem?.(item, i, articles.length);
  }
  return items;
}
