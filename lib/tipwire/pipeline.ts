/**
 * R-TIPWIRE per-article pipeline (#857, #862; reused by the daily poll #858):
 * match under a retrieval scope → judge, under the shared AI-call budget.
 *
 * A watch with no new documents costs only the retrieval and is reported as
 * `skippedNoDocs` — no judge call. `assertAiCallBudget()` runs before the
 * judge call and OUTSIDE its try/catch; a trip STOPS the run and is returned
 * (items judged so far + the unjudged remainder), never thrown (#564; the
 * first live run lost three judged tips by throwing).
 *
 * Beat checks (R-TIPWIRE-4 #876) run per category and concern every reporter
 * on it; the item carries `reporters` + `beatCategory` and `reporter` is the
 * first listed, so storage and the anchor CHECK constraint are unchanged.
 */

import { COVERAGE_WINDOW_DAYS } from '@/lib/data/coverage-outlets';
import type { TipCoverageCheck } from '@/lib/db/schema';
import { AiCallBudgetExceededError, assertAiCallBudget } from '@/lib/services/ai-call-budget';
import { formatError } from '@/lib/utils/api-helpers';
import type { DiscoveredArticle } from './acquire';
import type { CoverageChecker } from './coverage';
import { judgeArticle } from './judge';
import type { JudgeDeps, JudgeResult } from './judge';
import { retrieveForArticle } from './match';
import type { MatchDeps, MatchResult, RankedDoc, RetrievalScope, WatchKind } from './match';
import { retrieveBeatDocs } from './match-beat';
import { beatCategoriesOf, buildFrame, sinceFor } from './pipeline-frame';
import type { Frame, RecentTitlesLoader } from './pipeline-frame';
import type { BeatJudgeContext } from './prompt';
import { getReporter } from './roster';
import type { CategoryKey, ReporterEntry } from './roster';

export interface DocSummary {
  ref: number;
  id: number;
  title: string;
  category: string;
  tier: string;
  url: string | null;
  priorBoosted: boolean;
}

export interface PipelineReporter {
  id: string;
  name: string;
  outlet: string;
  outletDomain: string;
  hasFeed: boolean;
}

export interface PipelineItem {
  article: DiscoveredArticle;
  reporter: Pick<ReporterEntry, 'id' | 'name' | 'outlet'>;
  /** Beat only: every reporter on the category (snapshot); `reporter` is the first. */
  reporters?: PipelineReporter[];
  /** Beat only: the category the check ran on. */
  beatCategory?: CategoryKey;
  reactive: boolean;
  kind: WatchKind;
  /** Forward window start actually used (the previous check or the article date). */
  since: string | null;
  recentTitles: string[];
  match: Omit<MatchResult, 'docs'> & { docs: DocSummary[] };
  judge: JudgeResult;
  /** No documents in the window → nothing to judge, no AI spend. */
  skippedNoDocs: boolean;
  /** GDELT coverage of the tip's search keys (#861); tip verdicts only. Operator-facing. */
  coverage?: TipCoverageCheck;
}

export interface PipelineDeps {
  match?: Partial<MatchDeps>;
  judge?: JudgeDeps;
  now?: Date;
  /** Retrieval scope per article (the poll passes the watch state; default forward-from-article). */
  scopeFor?: (article: DiscoveredArticle) => RetrievalScope;
  /** Extra same-story titles beyond this batch, per reporter (the poll reads stored history). */
  recentTitles?: RecentTitlesLoader;
  /** Contradiction mode only: the article's body text, fetched fresh, never stored. */
  articleBody?: (article: DiscoveredArticle) => Promise<string | null>;
  /** Coverage check run after a tip verdict (one checker per run owns spacing + cap). */
  coverage?: CoverageChecker;
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

const toPipelineReporter = (r: ReporterEntry): PipelineReporter => ({
  id: r.id,
  name: r.name,
  outlet: r.outlet,
  outletDomain: r.outletDomain,
  hasFeed: r.feed !== null,
});

/** Every reporter an item concerns; single-reporter items resolve through the roster. */
export function itemReporters(it: PipelineItem): PipelineReporter[] {
  if (it.reporters && it.reporters.length > 0) return it.reporters;
  const r = getReporter(it.reporter.id);
  return r ? [toPipelineReporter(r)] : [{ ...it.reporter, outletDomain: '', hasFeed: false }];
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

function baseItem(f: Frame, judge: JudgeResult, match: PipelineItem['match']): PipelineItem {
  const item: PipelineItem = {
    article: f.article,
    reporter: { id: f.reporter.id, name: f.reporter.name, outlet: f.reporter.outlet },
    reactive: f.reactive,
    kind: f.scope.kind,
    since: sinceFor(f),
    recentTitles: f.recentTitles,
    match,
    judge,
    skippedNoDocs: false,
  };
  if (f.scope.kind === 'beat') {
    item.reporters = f.reporters.map(toPipelineReporter);
    item.beatCategory = f.scope.category;
  }
  return item;
}

function beatContext(f: Frame): BeatJudgeContext | undefined {
  if (f.scope.kind !== 'beat') return undefined;
  return {
    categories: beatCategoriesOf(f),
    reporters: f.reporters.map((r) => ({
      name: r.name,
      outlet: r.outlet,
      hasFeed: r.feed !== null,
      recentTitles: f.titlesByReporter.get(r.id) ?? [],
    })),
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
        beat: beatContext(f),
        article: f.article,
        articleBody,
        kind: f.scope.kind,
        since: sinceFor(f),
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
    match =
      f.scope.kind === 'beat'
        ? await retrieveBeatDocs(beatCategoriesOf(f), f.scope, { ...deps.match, now })
        : await retrieveForArticle(f.article, f.reporter, { ...deps.match, now }, f.scope);
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
  const judge = await judgeFrame(f, match, deps);
  const item = baseItem(f, judge, summary);
  if (judge.verdict === 'tip' && judge.tip && deps.coverage) {
    // The anchor piece is never "coverage" of its own follow-up; beat anchors have no URL.
    const own = f.scope.kind !== 'beat' && f.article.url ? [f.article.url] : [];
    item.coverage = await checkCoverage(deps.coverage, judge.tip.searchKeys, own);
  }
  return item;
}

/** Never lets a coverage failure touch the judged item: failure → not-checkable. */
async function checkCoverage(
  check: CoverageChecker,
  keys: string[],
  excludeUrls: string[],
): Promise<TipCoverageCheck> {
  try {
    return await check(keys, excludeUrls);
  } catch {
    return {
      checkedAt: new Date().toISOString(),
      windowDays: COVERAGE_WINDOW_DAYS,
      keys: [],
      label: 'not-checkable',
    };
  }
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
    const scope = deps.scopeFor?.(article) ?? { kind: 'forward' };
    const f = await buildFrame(
      article,
      reporter,
      articles,
      reporters,
      scope,
      deps.recentTitles,
      now,
    );
    const result = await processFrame(f, deps, now);
    if (result === CAP) return { items, capTripped: true, unjudged: articles.slice(i) };
    items.push(result);
    deps.onItem?.(result, i, articles.length);
  }
  return { items, capTripped: false, unjudged: [] };
}
