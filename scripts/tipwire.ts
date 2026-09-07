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
import {
  AiCallBudgetExceededError,
  configureAiCallBudget,
  getAiCallCount,
} from '@/lib/services/ai-call-budget';
import { discoverArticles, probeSource } from '@/lib/tipwire/acquire';
import type { DiscoveredArticle } from '@/lib/tipwire/acquire';
import {
  TipDecisionsFileSchema,
  buildPacketMarkdown,
  decisionsTemplate,
  renderScore,
  scoreDecisions,
} from '@/lib/tipwire/packet';
import { runPipeline } from '@/lib/tipwire/pipeline';
import type { PipelineItem } from '@/lib/tipwire/pipeline';
import { activeReporters } from '@/lib/tipwire/roster';
import { checkHelp } from '@/lib/utils/cli-help';

export type TipwireCommand = 'probe' | 'dryrun' | 'score' | 'poll' | 'digest' | 'sent';

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
  decisions?: string;
  packet?: string;
}

const COMMANDS: TipwireCommand[] = ['probe', 'dryrun', 'score', 'poll', 'digest', 'sent'];
/** Sonnet pricing for the precheck line ($/MTok in, out) and the per-article token shape. */
const EST_IN_TOKENS = 12_000;
const EST_OUT_TOKENS = 600;
const SONNET_IN_PER_MTOK = 3;
const SONNET_OUT_PER_MTOK = 15;
/** Cap default: every article could take the parse retry. */
const CALLS_PER_ARTICLE_CAP = 2;
/** Dry-run listing depth: enough article pages to reach two weeks back. */
const DRYRUN_PAGE_FETCHES = 40;
const EXIT_CAP_TRIPPED = 3;

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

export async function runProbe(): Promise<boolean> {
  let allOk = true;
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

async function runDryRun(args: TipwireArgs): Promise<number> {
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
  let items: PipelineItem[] = [];
  try {
    items = await runPipeline(articles, new Map(activeReporters().map((r) => [r.id, r])), {
      onItem: (it, i, n) =>
        console.log(
          `[tipwire] ${i + 1}/${n} ${it.reporter.id} → ${it.judge.verdict} (${it.judge.calls} call${it.judge.calls === 1 ? '' : 's'}, ${it.match.docs.length} docs) ${it.article.title.slice(0, 60)}`,
        ),
    });
  } catch (err) {
    if (!(err instanceof AiCallBudgetExceededError)) throw err;
    console.error(`[tipwire] ${err.message} — AI calls this run: ${getAiCallCount()}.`);
    return EXIT_CAP_TRIPPED;
  }
  writePacket(args.out, items, args.since);
  const tips = items.filter((i) => i.judge.verdict === 'tip').length;
  console.log(
    `[tipwire] done: ${items.length} judged, ${tips} proposed tip(s), ${getAiCallCount()} AI calls. Score with: pnpm tips:score --decisions ${args.out}/decisions-template.json --packet ${args.out}/packet.json`,
  );
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

async function main(args: TipwireArgs): Promise<number> {
  switch (args.command) {
    case 'probe':
      return (await runProbe()) ? 0 : 1;
    case 'dryrun':
      return runDryRun(args);
    case 'score':
      return runScore(args);
    default:
      console.error(`[tipwire] ${args.command} is not implemented yet (#858)`);
      return 1;
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
      console.error('[tipwire] Fatal:', err instanceof Error ? err.message : err);
      process.exit(1);
    });
}
