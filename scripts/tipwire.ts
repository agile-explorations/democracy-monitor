/**
 * R-TIPWIRE operator CLI (#854–#858). One entry point, subcommands:
 *
 *   pnpm tips:probe                      # fetch each active source once; print status + counts
 *   pnpm tips:dryrun --since D --out DIR [--confirm] [--max-calls N] [--pages N]   (#857)
 *   pnpm tips:score  --decisions F --packet F                          (#857)
 *   pnpm tips:poll   [--email] [--max-calls N] [--ignore-cadence]      (#858)
 *   pnpm tips:digest                                                    (#858)
 *   pnpm tips:sent   --candidate <id> [--replied|--dismiss]            (#858)
 *
 * Operator-only: DB credentials are the authorization (no web surface).
 * Never writes `documents`. The dry run writes files only (no DB rows, no
 * email). Exit codes: 0 ok · 1 error · 3 AI-call cap tripped (never retry 3).
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { isDbAvailable } from '@/lib/db';
import {
  AiCallBudgetExceededError,
  configureAiCallBudget,
  getAiCallCount,
} from '@/lib/services/ai-call-budget';
import { finishCronRun, startCronRun } from '@/lib/services/cron-run-store';
import { sendOpsAlert } from '@/lib/services/ops-alert-service';
import { discoverArticles, isReactive, probeSource } from '@/lib/tipwire/acquire';
import type { DiscoveredArticle } from '@/lib/tipwire/acquire';
import { fetchArticleBody } from '@/lib/tipwire/article-body';
import { beatAnchor, listBeatQueue, listBeatWeeks } from '@/lib/tipwire/beat-docs';
import { REMINDER_AFTER_DAYS, cadenceLabel, isInCooldown } from '@/lib/tipwire/cadence';
import type { SentRow } from '@/lib/tipwire/cadence';
import { GDELT_MAX_CALLS_PER_RUN, createCoverageChecker, probeGdelt } from '@/lib/tipwire/coverage';
import { buildDigestLines, digestSubject } from '@/lib/tipwire/digest';
import { MAX_CALLS_PER_ARTICLE } from '@/lib/tipwire/judge';
import {
  TipDecisionsFileSchema,
  buildPacketMarkdown,
  decisionsTemplate,
  renderScore,
  scoreDecisions,
} from '@/lib/tipwire/packet';
import { runPipeline } from '@/lib/tipwire/pipeline';
import type { PipelineDeps, PipelineItem } from '@/lib/tipwire/pipeline';
import { ARTICLE_BODY_CHARS } from '@/lib/tipwire/prompt';
import { activeReporters, getReporter } from '@/lib/tipwire/roster';
import type { ReporterEntry } from '@/lib/tipwire/roster';
import {
  insertCandidate,
  insertSkippedForCadence,
  knownKeysFor,
  listCandidates,
  listUnjudgedArticles,
  recentTitlesFromDb,
  recordSeenKeys,
  upsertArticles,
} from '@/lib/tipwire/store';
import { listOpenTipsLackingCoverage, updateCoverageCheck } from '@/lib/tipwire/store-coverage';
import {
  dismissCandidate,
  listUnrepliedSent,
  recordReply,
  recordSent,
  sentLogForReporters,
} from '@/lib/tipwire/store-sent';
import { listOpenWatches, touchWatch } from '@/lib/tipwire/store-watches';
import { formatError } from '@/lib/utils/api-helpers';
import { checkHelp } from '@/lib/utils/cli-help';
import { withCronLock } from '@/lib/utils/cron-lock';

export type TipwireCommand = 'probe' | 'dryrun' | 'score' | 'poll' | 'digest' | 'sent' | 'coverage';

export interface TipwireArgs {
  command: TipwireCommand;
  since?: string;
  out?: string;
  confirm: boolean;
  maxCalls?: number;
  pages?: number;
  email: boolean;
  ignoreCadence: boolean;
  candidate?: number;
  replied: boolean;
  dismiss: boolean;
  /** probe: one GDELT call (reachability canary, #867). */
  coverage: boolean;
  /** dryrun: beat pass over the last --weeks Mondays (#869 gate). */
  beat: boolean;
  weeks?: number;
  decisions?: string;
  packet?: string;
}

const COMMANDS: TipwireCommand[] = [
  'probe',
  'dryrun',
  'score',
  'poll',
  'digest',
  'sent',
  'coverage',
];
/** Sonnet pricing for the precheck line ($/MTok in, out) and the per-article token shape. */
const EST_IN_TOKENS = 12_000;
const EST_OUT_TOKENS = 600;
const SONNET_IN_PER_MTOK = 3;
const SONNET_OUT_PER_MTOK = 15;
/** Cap default: every article could take the parse retry. */
const CALLS_PER_ARTICLE_CAP = MAX_CALLS_PER_ARTICLE;
/** Dry-run listing depth: enough article pages to reach two weeks back. */
const DRYRUN_PAGE_FETCHES = 40;
/** Beat dry run: Mondays to sample when --weeks is not given. */
const BEAT_DRYRUN_WEEKS = 3;
const EXIT_CAP_TRIPPED = 3;
/** Daily poll: hard cap (no --confirm is possible inside a cron); a trip exits 3 and is never retried. */
const TIPWIRE_DAILY_MAX_CALLS = 30;
/** Only articles this fresh are judged by the daily poll (older backlog is the dry run's job). */
const POLL_MAX_ARTICLE_AGE_DAYS = 7;

export function parseTipwireArgs(argv: string[]): TipwireArgs {
  const [first, ...rest] = argv;
  if (!COMMANDS.includes(first as TipwireCommand)) {
    throw new Error(`unknown subcommand "${first ?? ''}" — expected one of ${COMMANDS.join(', ')}`);
  }
  const args: TipwireArgs = {
    command: first as TipwireCommand,
    confirm: false,
    email: false,
    ignoreCadence: false,
    replied: false,
    dismiss: false,
    coverage: false,
    beat: false,
  };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = () => rest[++i];
    if (a === '--since') args.since = next();
    else if (a === '--out') args.out = next();
    else if (a === '--max-calls') args.maxCalls = Number(next());
    else if (a === '--pages') args.pages = Number(next());
    else if (a === '--candidate') args.candidate = Number(next());
    else if (a === '--decisions') args.decisions = next();
    else if (a === '--packet') args.packet = next();
    else if (a === '--confirm') args.confirm = true;
    else if (a === '--email') args.email = true;
    else if (a === '--ignore-cadence') args.ignoreCadence = true;
    else if (a === '--replied') args.replied = true;
    else if (a === '--dismiss') args.dismiss = true;
    else if (a === '--coverage') args.coverage = true;
    else if (a === '--beat') args.beat = true;
    else if (a === '--weeks') args.weeks = Number(next());
    else throw new Error(`unknown flag ${a}`);
  }
  if (args.replied && args.dismiss) throw new Error('--replied and --dismiss are exclusive');
  return args;
}

/** Precheck numbers the spend protocol requires (calls, cap, dollars). */
export function dryRunEstimate(articles: number, maxCalls?: number) {
  const cap = maxCalls ?? articles * CALLS_PER_ARTICLE_CAP;
  const dollars =
    (articles * (EST_IN_TOKENS * SONNET_IN_PER_MTOK + EST_OUT_TOKENS * SONNET_OUT_PER_MTOK)) / 1e6;
  return { expectedCalls: `${articles}–${articles * CALLS_PER_ARTICLE_CAP}`, cap, dollars };
}

export async function runProbe(args: TipwireArgs): Promise<boolean> {
  let allOk = true;
  if (args.coverage) {
    const g = await probeGdelt();
    console.log(`${g.ok ? '✓' : '✗'} gdelt [api] ${g.detail}`);
    return g.ok;
  }
  for (const r of activeReporters()) {
    const p = await probeSource(r);
    allOk &&= p.ok;
    console.log(`${p.ok ? '✓' : '✗'} ${r.id} [${p.kind}] ${p.detail}`);
  }
  return allOk;
}

async function discoverSince(since: string, pages: number): Promise<DiscoveredArticle[]> {
  const out: DiscoveredArticle[] = [];
  for (const r of activeReporters()) {
    const res = await discoverArticles(r, { knownKeys: new Set(), maxPageFetches: pages });
    const kept = res.articles.filter((a) => a.publishedAt && a.publishedAt >= since);
    console.log(
      `[tipwire] ${r.id}: listed ${res.listed}, fetched ${res.pageFetches} pages, attributed ${res.articles.length}, since ${since}: ${kept.length}` +
        (res.errors.length
          ? ` · ${res.errors.length} error(s): ${res.errors[0].slice(0, 100)}`
          : ''),
    );
    out.push(...kept);
  }
  return out.sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''));
}

function writePacket(out: string, items: PipelineItem[], since: string): void {
  const meta = {
    since,
    generatedAt: new Date().toISOString(),
    reporters: activeReporters().map((r) => r.id),
  };
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'packet.md'), buildPacketMarkdown(items, meta));
  writeFileSync(path.join(out, 'packet.json'), JSON.stringify(items, null, 1));
  writeFileSync(
    path.join(out, 'decisions-template.json'),
    JSON.stringify(decisionsTemplate(items, meta), null, 2),
  );
  console.log(`[tipwire] wrote ${out}/packet.md, packet.json, decisions-template.json`);
}

/** Beat gate (#869/#870): one item per reporter × week, judged with no article anchor. */
async function runBeatDryRun(args: TipwireArgs): Promise<number> {
  if (!args.out) throw new Error('dryrun --beat needs --out DIR');
  const weeks = args.weeks ?? BEAT_DRYRUN_WEEKS;
  const reporters = activeReporters();
  const queue = await listBeatWeeks(reporters, weeks, new Date());
  const est = dryRunEstimate(queue.length, args.maxCalls);
  for (const q of queue)
    console.log(
      `[tipwire] ${q.reporter.id} week of ${q.weekOf}: ${q.docIds.length} flagged doc(s)`,
    );
  console.log(
    `[tipwire] precheck — beat checks: ${queue.length} (${reporters.length} reporters × ${weeks} weeks, empty weeks skipped); expected AI calls: ${est.expectedCalls}; cap: ${est.cap}; est cost ~$${est.dollars.toFixed(2)}; no retrieval spend`,
  );
  if (!args.confirm) {
    console.log('[tipwire] Precheck only. Re-run with --confirm to judge and write the packet.');
    return 0;
  }
  configureAiCallBudget(est.cap);
  const scopes = new Map(queue.map((q) => [beatAnchor(q.reporter, q.weekOf).articleKey, q]));
  const run = await runPipeline(
    queue.map((q) => beatAnchor(q.reporter, q.weekOf)),
    new Map(reporters.map((r) => [r.id, r])),
    {
      scopeFor: (a) => {
        const q = scopes.get(a.articleKey);
        return { kind: 'beat', docIds: q?.docIds ?? [], weekOf: q?.weekOf };
      },
      // The judge must see what the reporter actually wrote, not the batch's placeholders.
      recentTitles: (a) => recentTitlesFromDb(a.reporterId, new Date(a.publishedAt ?? Date.now())),
      coverage: createCoverageChecker(),
      onItem: (it, i, n) =>
        console.log(
          `[tipwire] ${i + 1}/${n} beat ${it.reporter.id} week of ${it.since?.slice(0, 10)} → ${it.judge.verdict} (${it.judge.calls} call(s), ${it.match.docs.length} docs)`,
        ),
    },
  );
  writePacket(args.out, run.items, `beat:${weeks}w`);
  console.log(
    `[tipwire] done: ${run.items.length} judged, ${run.items.filter((i) => i.judge.verdict === 'tip').length} proposed tip(s), ${getAiCallCount()} AI calls.` +
      (run.capTripped ? ' CAP TRIPPED.' : ''),
  );
  return run.capTripped ? 3 : 0;
}

async function runDryRun(args: TipwireArgs): Promise<number> {
  if (args.beat) return runBeatDryRun(args);
  if (!args.since || !args.out) throw new Error('dryrun needs --since YYYY-MM-DD and --out DIR');
  const articles = await discoverSince(args.since, args.pages ?? DRYRUN_PAGE_FETCHES);
  const est = dryRunEstimate(articles.length, args.maxCalls);
  console.log(
    `[tipwire] precheck — articles: ${articles.length}; expected AI calls: ${est.expectedCalls}; cap: ${est.cap}; est cost ~$${est.dollars.toFixed(2)} (Sonnet, ${EST_IN_TOKENS}/${EST_OUT_TOKENS} tokens per call) + ~$0.004/article retrieval`,
  );
  if (!args.confirm) {
    console.log('[tipwire] Precheck only. Re-run with --confirm to judge and write the packet.');
    return 0;
  }
  configureAiCallBudget(est.cap);
  // Forward from the article date: "since your piece on X, this appeared in the record."
  const run = await runPipeline(articles, new Map(activeReporters().map((r) => [r.id, r])), {
    scopeFor: () => ({ kind: 'forward' }),
    coverage: createCoverageChecker(),
    onItem: (it, i, n) =>
      console.log(
        `[tipwire] ${i + 1}/${n} ${it.reporter.id} → ${it.skippedNoDocs ? 'no new docs' : it.judge.verdict} (${it.judge.calls} call${it.judge.calls === 1 ? '' : 's'}, ${it.match.docs.length} docs since ${it.since?.slice(0, 10) ?? '?'}) ${it.article.title.slice(0, 60)}`,
      ),
  });
  writePacket(args.out, run.items, args.since);
  const tips = run.items.filter((i) => i.judge.verdict === 'tip').length;
  console.log(
    `[tipwire] done: ${run.items.length} judged, ${tips} proposed tip(s), ${getAiCallCount()} AI calls. Score with: pnpm tips:score --decisions ${args.out}/decisions-template.json --packet ${args.out}/packet.json`,
  );
  if (run.capTripped) {
    console.error(
      `[tipwire] AI-call cap ${est.cap} tripped with ${run.unjudged.length} article(s) unjudged — partial packet written. Exiting 3 (do not retry blindly; review the estimate).`,
    );
    return EXIT_CAP_TRIPPED;
  }
  return 0;
}

function runScore(args: TipwireArgs): number {
  if (!args.decisions) throw new Error('score needs --decisions FILE [--packet FILE]');
  const packetPath = args.packet ?? path.join(path.dirname(args.decisions), 'packet.json');
  const decisions = TipDecisionsFileSchema.parse(JSON.parse(readFileSync(args.decisions, 'utf8')));
  const items = JSON.parse(readFileSync(packetPath, 'utf8')) as PipelineItem[];
  for (const line of renderScore(scoreDecisions(decisions, items))) console.log(line);
  return 0;
}

// ---------------------------------------------------------------------------
// poll / digest / sent (#858)
// ---------------------------------------------------------------------------

interface PollOutcome {
  discovered: number;
  judged: number;
  tips: number;
  /** Open watches checked this run (forward pass). */
  watches: number;
  /** Beat checks judged this run (pass 3, #871). */
  beatChecks: number;
  skippedForCadence: string[];
  errors: string[];
  calls: number;
  capTripped: boolean;
}

/** Discover against stored keys and store EVERY attributed article (so it is
 *  never re-fetched), whatever its age; judging is decided separately. */
async function discoverNew(reporters: ReporterEntry[], errors: string[]): Promise<number> {
  let stored = 0;
  for (const r of reporters) {
    const known = await knownKeysFor(r.id);
    const res = await discoverArticles(r, { knownKeys: known });
    errors.push(...res.errors);
    console.log(
      `[tipwire] ${r.id}: listed ${res.listed} new, fetched ${res.pageFetches}, attributed ${res.articles.length}, rejected ${res.rejectedKeys.length}`,
    );
    stored += (await upsertArticles(res.articles)).size;
    await recordSeenKeys(r.id, res.rejectedKeys);
  }
  return stored;
}

/** Reporters in the unreplied-cooldown are skipped without spend; returns the skipped ids. */
function cadenceFilter<T extends { article: DiscoveredArticle }>(
  queue: T[],
  sent: SentRow[],
  now: Date,
  ignore: boolean,
): { keep: T[]; skipped: string[] } {
  const keep: T[] = [];
  const skipped: string[] = [];
  for (const q of queue) {
    const rid = q.article.reporterId;
    if (!ignore && isInCooldown(rid, sent, now)) {
      if (!skipped.includes(rid)) skipped.push(rid);
      continue;
    }
    keep.push(q);
  }
  return { keep, skipped };
}

const progress = (it: PipelineItem, i: number, n: number) =>
  console.log(
    `[tipwire] ${i + 1}/${n} ${it.kind} ${it.reporter.id} → ${it.skippedNoDocs ? 'no new docs' : it.judge.verdict} ${it.article.title.slice(0, 60)}`,
  );

/** Persist a run's items; returns counts. */
async function persistItems(
  items: PipelineItem[],
  ids: Map<string, number>,
  runId: string,
  outcome: PollOutcome,
): Promise<void> {
  for (const it of items) {
    // Beat items have no article row (#871); the CHECK constraint requires reporter_id instead.
    const id = it.kind === 'beat' ? null : (ids.get(it.article.articleKey) ?? null);
    if (it.kind !== 'beat' && !id) continue;
    if (!it.skippedNoDocs) {
      await insertCandidate(id, it, runId);
      outcome.judged++;
      if (it.judge.verdict === 'tip') outcome.tips++;
      if (it.judge.verdict === 'error' && it.judge.error) outcome.errors.push(it.judge.error);
    }
    if (it.kind === 'forward' && id) await touchWatch(id, new Date());
  }
}

/** Pass 3 — beat (#871): one check per reporter with new Pass 2 documents since their last beat week. */
async function runBeatPass(
  args: TipwireArgs,
  byId: Map<string, ReporterEntry>,
  sent: SentRow[],
  now: Date,
  shared: PipelineDeps,
  runId: string,
  outcome: PollOutcome,
): Promise<boolean> {
  const queue = await listBeatQueue([...byId.values()], now);
  const items = queue.map((q) => ({ article: beatAnchor(q.reporter, q.weekOf), q }));
  const b = cadenceFilter(items, sent, now, args.ignoreCadence);
  outcome.beatChecks = b.keep.length;
  outcome.skippedForCadence = [...new Set([...outcome.skippedForCadence, ...b.skipped])];
  if (b.keep.length === 0) return false;
  const byKey = new Map(b.keep.map((x) => [x.article.articleKey, x.q]));
  const beat = await runPipeline(
    b.keep.map((x) => x.article),
    byId,
    {
      ...shared,
      scopeFor: (a) => {
        const q = byKey.get(a.articleKey);
        return { kind: 'beat', docIds: q?.docIds ?? [], weekOf: q?.weekOf };
      },
    },
  );
  await persistItems(beat.items, new Map(), runId, outcome);
  return beat.capTripped;
}

async function pollOnce(args: TipwireArgs, runId: string): Promise<PollOutcome> {
  const outcome: PollOutcome = {
    discovered: 0,
    judged: 0,
    tips: 0,
    watches: 0,
    beatChecks: 0,
    skippedForCadence: [],
    errors: [],
    calls: 0,
    capTripped: false,
  };
  // Daily reachability line for #867: one GDELT call, minutes before any coverage check.
  const gdelt = await probeGdelt();
  console.log(`[tipwire] gdelt reachability: ${gdelt.ok ? 'ok' : 'unavailable'} — ${gdelt.detail}`);
  const reporters = activeReporters();
  const byId = new Map(reporters.map((r) => [r.id, r]));
  outcome.discovered = await discoverNew(reporters, outcome.errors);
  const now = new Date();
  const sent = await sentLogForReporters(30);
  configureAiCallBudget(args.maxCalls ?? TIPWIRE_DAILY_MAX_CALLS);
  const shared = {
    now,
    recentTitles: (a: DiscoveredArticle) =>
      recentTitlesFromDb(a.reporterId, a.publishedAt ? new Date(a.publishedAt) : now),
    articleBody: (a: DiscoveredArticle) =>
      a.url ? fetchArticleBody(a.url, ARTICLE_BODY_CHARS) : Promise.resolve(null),
    coverage: createCoverageChecker(),
    onItem: progress,
  };

  // Pass 1 — contradiction: brand-new reactive articles, once, against the record that predates them.
  const fresh = (await listUnjudgedArticles(2)).filter((q) =>
    isReactive(q.article.publishedAt, now),
  );
  const c = cadenceFilter(fresh, sent, now, args.ignoreCadence);
  for (const q of fresh.filter((f) => !c.keep.includes(f)))
    await insertSkippedForCadence(q.id, runId);
  const contradiction = await runPipeline(
    c.keep.map((q) => q.article),
    byId,
    { ...shared, scopeFor: () => ({ kind: 'contradiction' }) },
  );
  await persistItems(
    contradiction.items,
    new Map(c.keep.map((q) => [q.article.articleKey, q.id])),
    runId,
    outcome,
  );

  // Pass 2 — forward: every open watch, since its last check; no judge call without new documents.
  let forwardTripped = false;
  let beatTripped = false;
  if (!contradiction.capTripped) {
    const watches = await listOpenWatches(now);
    const w = cadenceFilter(watches, sent, now, args.ignoreCadence);
    outcome.watches = w.keep.length;
    const byKey = new Map(w.keep.map((x) => [x.article.articleKey, x]));
    const forward = await runPipeline(
      w.keep.map((x) => x.article),
      byId,
      {
        ...shared,
        scopeFor: (a) => {
          const x = byKey.get(a.articleKey);
          return {
            kind: 'forward',
            since: x?.lastCheckedAt?.toISOString() ?? null,
            excludeDocIds: x?.citedDocIds ?? [],
          };
        },
      },
    );
    await persistItems(
      forward.items,
      new Map(w.keep.map((x) => [x.article.articleKey, x.id])),
      runId,
      outcome,
    );
    forwardTripped = forward.capTripped;
    outcome.skippedForCadence = [...new Set([...c.skipped, ...w.skipped])];
    if (!forwardTripped)
      beatTripped = await runBeatPass(args, byId, sent, now, shared, runId, outcome);
  } else {
    outcome.skippedForCadence = c.skipped;
  }

  outcome.calls = getAiCallCount();
  outcome.capTripped = contradiction.capTripped || forwardTripped || beatTripped;
  if (outcome.capTripped)
    outcome.errors.push('AI-call cap tripped; remaining watches are re-checked next run');
  return outcome;
}

async function emailDigest(skippedForCadence: string[]): Promise<void> {
  const sent = await sentLogForReporters(30);
  const now = new Date();
  const cands = await listCandidates('open', (rid) => cadenceLabel(rid, sent as SentRow[], now));
  if (cands.length === 0) {
    console.log('[tipwire] no open candidates — no email');
    return;
  }
  const reminders = await listUnrepliedSent(REMINDER_AFTER_DAYS);
  const ok = await sendOpsAlert(
    digestSubject(cands),
    buildDigestLines(cands, reminders, skippedForCadence),
  );
  console.log(`[tipwire] digest ${ok ? 'sent' : 'NOT sent'} (${cands.length} candidate(s))`);
}

async function runPoll(args: TipwireArgs): Promise<number> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const runId = `poll-${new Date().toISOString().slice(0, 16)}`;
  let code = 0;
  const ran = await withCronLock('tipwire', async () => {
    const cronRunId = await startCronRun('tipwire');
    try {
      const o = await pollOnce(args, runId);
      console.log(
        `[tipwire] poll done: ${o.discovered} article(s) stored, ${o.watches} watch(es) checked, ${o.beatChecks} beat check(s), ${o.judged} judged, ${o.tips} tip(s), ${o.calls} AI call(s)` +
          (o.skippedForCadence.length
            ? `, cadence-skipped: ${o.skippedForCadence.join(', ')}`
            : '') +
          (o.capTripped ? ' — CAP TRIPPED, exiting 3' : ''),
      );
      if (args.email) await emailDigest(o.skippedForCadence);
      const status = o.capTripped ? 'failed' : o.errors.length ? 'partial' : 'success';
      await finishCronRun(cronRunId, status, { ...o, runId }, o.errors);
      if (o.capTripped) code = EXIT_CAP_TRIPPED;
    } catch (err) {
      await finishCronRun(cronRunId, 'failed', { runId }, [formatError(err)]);
      throw err;
    }
  });
  if (!ran) {
    console.error('[tipwire] another poll holds the lock — skipped');
    return 2;
  }
  return code;
}

/** Backfill coverage for open tips created before the check existed or while GDELT was down. */
async function runCoverage(args: TipwireArgs): Promise<number> {
  const rows = await listOpenTipsLackingCoverage(args.candidate);
  if (rows.length === 0) {
    console.log('[tipwire] no open tip candidates lacking a coverage check');
    return 0;
  }
  const check = createCoverageChecker({ maxCalls: args.maxCalls ?? GDELT_MAX_CALLS_PER_RUN });
  for (const r of rows) {
    const result = await check(r.searchKeys, getReporter(r.reporterId)?.outletDomain);
    await updateCoverageCheck(r.id, result);
    console.log(
      `[tipwire] #${r.id} ${r.reporterId} → ${result.label} (${result.keys.length} key(s))`,
    );
  }
  return 0;
}

async function runDigest(): Promise<number> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const sent = await sentLogForReporters(30);
  const now = new Date();
  const cands = await listCandidates('open', (rid) => cadenceLabel(rid, sent as SentRow[], now));
  const reminders = await listUnrepliedSent(REMINDER_AFTER_DAYS);
  for (const block of buildDigestLines(cands, reminders, [])) console.log(block + '\n');
  return 0;
}

async function runSent(args: TipwireArgs): Promise<number> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  if (!args.candidate) throw new Error('sent needs --candidate <id>');
  if (args.replied) {
    const ok = await recordReply(args.candidate);
    console.log(
      ok
        ? `[tipwire] #${args.candidate}: reply recorded — cooldown lifted`
        : `[tipwire] #${args.candidate}: no unreplied send found`,
    );
    return ok ? 0 : 1;
  }
  if (args.dismiss) {
    const ok = await dismissCandidate(args.candidate);
    console.log(
      ok
        ? `[tipwire] #${args.candidate}: dismissed (no cooldown)`
        : `[tipwire] #${args.candidate}: not open`,
    );
    return ok ? 0 : 1;
  }
  const reporterId = await recordSent(args.candidate);
  console.log(
    `[tipwire] #${args.candidate}: marked sent — ${reporterId} enters the ${REMINDER_AFTER_DAYS}-day reply window / 3-week cooldown`,
  );
  return 0;
}

async function main(args: TipwireArgs): Promise<number> {
  switch (args.command) {
    case 'probe':
      return (await runProbe(args)) ? 0 : 1;
    case 'dryrun':
      return runDryRun(args);
    case 'score':
      return runScore(args);
    case 'poll':
      return runPoll(args);
    case 'digest':
      return runDigest();
    case 'coverage':
      return runCoverage(args);
    case 'sent':
      return runSent(args);
  }
}

const USAGE =
  'Usage: pnpm tips:<probe|dryrun|score|poll|digest|sent> [flags] — see scripts/tipwire.ts header';

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(argv, USAGE);
  Promise.resolve()
    .then(() => main(parseTipwireArgs(argv)))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[tipwire] Fatal:', formatError(err));
      process.exit(1);
    });
}
