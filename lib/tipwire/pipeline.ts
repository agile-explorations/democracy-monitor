/**
 * R-TIPWIRE per-article pipeline (#857, #862; reused by the daily poll #858):
 * match under a retrieval scope → judge, under the shared AI-call budget.
 *
 * A watch with no new documents costs only the retrieval and is reported as
 * `skippedNoDocs` — no judge call. `assertAiCallBudget()` runs before the
 * judge call and OUTSIDE its try/catch; a trip STOPS the run and is returned
 * (items judged so far + the unjudged remainder), never thrown (#564; the
 * first live run lost three judged tips by throwing).
 */

import { AiCallBudgetExceededError, assertAiCallBudget } from '@/lib/services/ai-call-budget';
import { formatError } from '@/lib/utils/api-helpers';
import { ONE_DAY_MS } from '@/lib/utils/date-utils';
import { isReactive } from './acquire';
import type { DiscoveredArticle } from './acquire';
import { judgeArticle } from './judge';
import type { JudgeDeps, JudgeResult } from './judge';
import { retrieveForArticle } from './match';
import type { MatchDeps, MatchResult, RankedDoc, RetrievalScope, WatchKind } from './match';
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
  kind: WatchKind;
  /** Forward window start actually used (the previous check or the article date). */
  since: string | null;
  recentTitles: string[];
  match: Omit<MatchResult, 'docs'> & { docs: DocSummary[] };
  judge: JudgeResult;
  /** No documents in the window → nothing to judge, no AI spend. */
  skippedNoDocs: boolean;
}

export interface PipelineDeps {
  match?: Partial<MatchDeps>;
  judge?: JudgeDeps;
  now?: Date;
  /** Retrieval scope per article (the poll passes the watch state; default forward-from-article). */
  scopeFor?: (article: DiscoveredArticle) => RetrievalScope;
  /** Extra same-story titles beyond this batch (the poll reads stored history). */
  recentTitles?: (article: DiscoveredArticle) => Promise<string[]>;
  /** Contradiction mode only: the article's body text, fetched fresh, never stored. */
  articleBody?: (article: DiscoveredArticle) => Promise<string | null>;
  /** Progress sink (CLI prints; tests collect). */
  onItem?: (item: PipelineItem, index: number, total: number) => void;
}

export interface PipelineRun {
  items: PipelineItem[];
  /** The AI-call cap stopped the run; `items` holds everything judged before it. */
  capTripped: boolean;
  /** Articles not reached because of the trip (still unjudged; a later run picks them up). */
  unjudged: DiscoveredArticle[];
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

const NO_JUDGE: Omit<JudgeResult, 'verdict'> = {
  model: 'n/a',
  promptVersion: '',
  tokensIn: 0,
  tokensOut: 0,
  latencyMs: 0,
  calls: 0,
};

function emptyMatch(article: DiscoveredArticle, scope: RetrievalScope) {
  return {
    query: '',
    queryMode: article.lede ? ('title+lede' as const) : ('title+categories' as const),
    kind: scope.kind,
    window: { from: '', to: '' },
    docs: [] as DocSummary[],
    structural: [],
    meta: { retrieved: 0, reranked: 0, boosted: 0, excluded: 0, minedAliases: 0, retrievalMs: 0 },
  };
}

interface Frame {
  article: DiscoveredArticle;
  reporter: ReporterEntry;
  reactive: boolean;
  scope: RetrievalScope;
  recentTitles: string[];
}

function baseItem(f: Frame, judge: JudgeResult, match: PipelineItem['match']): PipelineItem {
  return {
    article: f.article,
    reporter: { id: f.reporter.id, name: f.reporter.name, outlet: f.reporter.outlet },
    reactive: f.reactive,
    kind: f.scope.kind,
    since: f.scope.kind === 'forward' ? (f.scope.since ?? f.article.publishedAt) : null,
    recentTitles: f.recentTitles,
    match,
    judge,
    skippedNoDocs: false,
  };
}

async function frameFor(
  article: DiscoveredArticle,
  reporter: ReporterEntry,
  all: DiscoveredArticle[],
  deps: PipelineDeps,
  now: Date,
): Promise<Frame> {
  const stored = deps.recentTitles ? await deps.recentTitles(article) : [];
  return {
    article,
    reporter,
    reactive: isReactive(article.publishedAt, now),
    scope: deps.scopeFor?.(article) ?? { kind: 'forward' },
    recentTitles: [
      ...new Set([...recentTitlesFor(article, all), ...stored.filter((t) => t !== article.title)]),
    ],
  };
}

async function judgeFrame(f: Frame, match: MatchResult, deps: PipelineDeps): Promise<JudgeResult> {
  try {
    const articleBody =
      f.scope.kind === 'contradiction' && deps.articleBody
        ? await deps.articleBody(f.article)
        : null;
    return await judgeArticle(
      {
        reporter: f.reporter,
        article: f.article,
        articleBody,
        kind: f.scope.kind,
        since: f.scope.kind === 'forward' ? (f.scope.since ?? f.article.publishedAt) : null,
        recentTitles: f.recentTitles,
        structural: match.structural,
        docs: match.docs,
      },
      deps.judge,
    );
  } catch (err) {
    return { ...NO_JUDGE, verdict: 'error', error: formatError(err) };
  }
}

const CAP = Symbol('cap');

/** One article: retrieval failure → error item; empty window → skipped item; cap → CAP. */
async function processFrame(
  f: Frame,
  deps: PipelineDeps,
  now: Date,
): Promise<PipelineItem | typeof CAP> {
  let match: MatchResult;
  try {
    match = await retrieveForArticle(f.article, f.reporter, { ...deps.match, now }, f.scope);
  } catch (err) {
    const judge: JudgeResult = { ...NO_JUDGE, verdict: 'error', error: formatError(err) };
    return baseItem(f, judge, emptyMatch(f.article, f.scope));
  }
  const summary = { ...match, docs: summarizeDocs(match.docs) };
  if (match.docs.length === 0) {
    const judge: JudgeResult = {
      ...NO_JUDGE,
      verdict: 'no_tip',
      reasonsNoTip: 'no documents in the window',
    };
    return { ...baseItem(f, judge, summary), skippedNoDocs: true };
  }
  try {
    assertAiCallBudget();
  } catch (err) {
    if (err instanceof AiCallBudgetExceededError) return CAP;
    throw err;
  }
  return baseItem(f, await judgeFrame(f, match, deps), summary);
}

/** Match + judge every article, in order. Never throws for per-article problems. */
export async function runPipeline(
  articles: DiscoveredArticle[],
  reporters: Map<string, ReporterEntry>,
  deps: PipelineDeps = {},
): Promise<PipelineRun> {
  const now = deps.now ?? new Date();
  const items: PipelineItem[] = [];
  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const reporter = reporters.get(article.reporterId);
    if (!reporter) continue;
    const f = await frameFor(article, reporter, articles, deps, now);
    const result = await processFrame(f, deps, now);
    if (result === CAP) return { items, capTripped: true, unjudged: articles.slice(i) };
    items.push(result);
    deps.onItem?.(result, i, articles.length);
  }
  return { items, capTripped: false, unjudged: [] };
}
