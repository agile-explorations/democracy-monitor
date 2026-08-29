/**
 * Pool-hygiene battery (#803): what a reader sees first, measured on
 * questions nobody tuned on.
 *
 *   pnpm retrieval:hygiene --base URL --out FILE [--set novel|outreach|all] [--gate] [--pace MS]
 *   pnpm retrieval:hygiene --diff A.json B.json
 *   pnpm retrieval:hygiene --report FILE
 *
 * Captures every question in scripts/hygiene-questions.json through the
 * production docsOnly path (no synthesis spend; cold builds cost the
 * expansion + salience-judge calls, cents), 202/429-aware like the browser
 * client, then reports per-question and cross-question metrics
 * (lib/utils/retrieval-hygiene.ts). `--gate` exits 1 above the thresholds.
 *
 * Policy: the `novel` set is never used for tuning; rotate a third out per
 * retrieval sprint, written before that sprint's code changes.
 */

import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { checkHelp } from '@/lib/utils/cli-help';
import {
  DEFAULT_THRESHOLDS,
  diffRuns,
  gateFailures,
  renderRun,
  runMetrics,
} from '@/lib/utils/retrieval-hygiene';
import type { HygieneCapture } from '@/lib/utils/retrieval-hygiene';
import { machineAuthHeaders } from './loadtest/client';

const USAGE = `Usage:
  pnpm retrieval:hygiene --base URL --out FILE [--set novel|outreach|all] [--gate] [--pace MS]
  pnpm retrieval:hygiene --diff A.json B.json
  pnpm retrieval:hygiene --report FILE

  --base URL     Server to capture from (prod: https://democracymonitor.us).
  --out FILE     Capture output (JSON of HygieneCapture[]).
  --set          Which bank to run (default all).
  --gate         Exit 1 when the run breaches DEFAULT_THRESHOLDS.
  --pace MS      Pause after a cached answer (default 6000; cold builds pace themselves).
  --diff A B     Per-question deltas between two captures.
  --report FILE  Re-render metrics for an existing capture.`;

interface BankQuestion {
  id: string;
  question: string;
  params?: Record<string, string>;
}

const CLIENT_BUDGET_MS = 300_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function arg(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

function loadBank(set: string): BankQuestion[] {
  const bank = JSON.parse(readFileSync(path.join(__dirname, 'hygiene-questions.json'), 'utf8')) as {
    novel: BankQuestion[];
    outreach: BankQuestion[];
  };
  if (set === 'novel') return bank.novel;
  if (set === 'outreach') return bank.outreach;
  return [...bank.novel, ...bank.outreach];
}

/** One browser-faithful docsOnly capture: re-request on edge cut, wait-poll
 *  on 202 (another build in flight), back off on 429 (per-source slots). */
async function capture(base: string, q: BankQuestion): Promise<HygieneCapture> {
  const url = `${base}/api/search?${new URLSearchParams({
    mode: 'research',
    docsOnly: 'true',
    q: q.question,
    ...(q.params ?? {}),
  })}`;
  const headers = machineAuthHeaders();
  const t0 = Date.now();
  while (Date.now() - t0 < CLIENT_BUDGET_MS) {
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: AbortSignal.timeout(175_000) });
    } catch {
      await sleep(15_000);
      continue;
    }
    if (res.status === 202) {
      const body = (await res.json().catch(() => ({}))) as { retryAfterMs?: number };
      await sleep(Math.max(8_000, body.retryAfterMs ?? 8_000));
      continue;
    }
    if (res.status === 429) {
      await sleep(30_000);
      continue;
    }
    if (!res.ok) return { ...empty(q), error: `HTTP ${res.status}` };
    const d = (await res.json()) as {
      documents?: Array<Record<string, unknown>>;
      alsoSearched?: string[];
      strata?: Array<{ label: string; docCount: number }>;
    };
    return {
      id: q.id,
      q: q.question,
      ms: Date.now() - t0,
      docs: (d.documents ?? []).map((x) => ({
        id: Number(x.id),
        cosineSimilarity: Number(x.cosineSimilarity ?? 0),
        matchedAlias: (x.matchedAlias as string | undefined) ?? null,
        provenance: (x.provenance as 'seed' | 'arm' | undefined) ?? null,
        title: String(x.title ?? ''),
      })),
      alsoSearched: d.alsoSearched ?? [],
      strata: d.strata?.map((s) => `${s.label}:${s.docCount}`) ?? null,
    };
  }
  return { ...empty(q), error: 'timeout' };
}

function empty(q: BankQuestion): HygieneCapture {
  return { id: q.id, q: q.question, ms: null, docs: [], alsoSearched: [], strata: null };
}

function readCaptures(file: string): HygieneCapture[] {
  return JSON.parse(readFileSync(file, 'utf8')) as HygieneCapture[];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  checkHelp(args, USAGE);
  if (args.includes('--diff')) {
    const i = args.indexOf('--diff');
    const a = runMetrics(readCaptures(args[i + 1]));
    const b = runMetrics(readCaptures(args[i + 2]));
    for (const line of diffRuns(a, b)) console.log(line);
    return;
  }
  const report = arg(args, '--report');
  if (report) {
    for (const line of renderRun(runMetrics(readCaptures(report)), path.basename(report)))
      console.log(line);
    return;
  }
  const base = arg(args, '--base');
  const out = arg(args, '--out');
  if (!base || !out) throw new Error(USAGE);
  const pace = Number(arg(args, '--pace') ?? 6000);
  const bank = loadBank(arg(args, '--set') ?? 'all');
  const captures: HygieneCapture[] = [];
  for (const q of bank) {
    const c = await capture(base, q);
    captures.push(c);
    console.log(
      `[hygiene] ${q.id.padEnd(16)} docs=${c.docs.length} ${c.ms != null ? `${(c.ms / 1000).toFixed(0)}s` : ''} ${c.error ?? ''}`,
    );
    writeFileSync(out, JSON.stringify(captures, null, 1));
    await sleep(c.ms != null && c.ms < 3000 ? pace : 30_000);
  }
  const m = runMetrics(captures);
  for (const line of renderRun(m, path.basename(out))) console.log(line);
  if (args.includes('--gate')) {
    const failures = gateFailures(m, DEFAULT_THRESHOLDS);
    if (failures.length > 0) {
      console.error(`[hygiene] GATE FAILED: ${failures.join('; ')}`);
      process.exit(1);
    }
    console.log('[hygiene] gate passed');
  }
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  main().catch((err) => {
    console.error('[hygiene] Fatal:', err);
    process.exit(1);
  });
}
