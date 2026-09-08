/**
 * R-TIPWIRE CLI shared pieces (split from ./tipwire for R-TIPWIRE-4 #877):
 * the argument shape, the spend precheck, the packet writer, persistence of
 * a pipeline run, the progress line, and roster resolution for `--reporter`.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { MAX_CALLS_PER_ARTICLE } from '@/lib/tipwire/judge';
import { buildPacketMarkdown, decisionsTemplate } from '@/lib/tipwire/packet';
import type { PipelineItem } from '@/lib/tipwire/pipeline';
import { beatReporters, getReporter } from '@/lib/tipwire/roster';
import type { ReporterEntry } from '@/lib/tipwire/roster';
import { insertCandidate } from '@/lib/tipwire/store';
import { touchWatch } from '@/lib/tipwire/store-watches';

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
  /** dryrun --beat: roster ids to check, active or not (the #878 gate); sent: the recipients. */
  reporterIds?: string[];
  decisions?: string;
  packet?: string;
}

export const EXIT_CAP_TRIPPED = 3;
/** Daily poll: hard cap (no --confirm is possible inside a cron); a trip exits 3 and is never retried. */
export const TIPWIRE_DAILY_MAX_CALLS = 30;

/** Sonnet pricing for the precheck line ($/MTok in, out) and the per-article token shape. */
export const EST_IN_TOKENS = 12_000;
export const EST_OUT_TOKENS = 600;
const SONNET_IN_PER_MTOK = 3;
const SONNET_OUT_PER_MTOK = 15;
/** Cap default: every article could take the parse retry. */
const CALLS_PER_ARTICLE_CAP = MAX_CALLS_PER_ARTICLE;

/** Precheck numbers the spend protocol requires (calls, cap, dollars). */
export function dryRunEstimate(articles: number, maxCalls?: number) {
  const cap = maxCalls ?? articles * CALLS_PER_ARTICLE_CAP;
  const dollars =
    (articles * (EST_IN_TOKENS * SONNET_IN_PER_MTOK + EST_OUT_TOKENS * SONNET_OUT_PER_MTOK)) / 1e6;
  return { expectedCalls: `${articles}–${articles * CALLS_PER_ARTICLE_CAP}`, cap, dollars };
}

export interface PollOutcome {
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

export const progress = (it: PipelineItem, i: number, n: number) =>
  console.log(
    `[tipwire] ${i + 1}/${n} ${it.kind} ${it.reporter.id} → ${it.skippedNoDocs ? 'no new docs' : it.judge.verdict} ${it.article.title.slice(0, 60)}`,
  );

/** Persist a run's items; returns counts. */
export async function persistItems(
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

export function writePacket(
  out: string,
  items: PipelineItem[],
  since: string,
  reporters: string[],
): void {
  const meta = { since, generatedAt: new Date().toISOString(), reporters };
  mkdirSync(out, { recursive: true });
  writeFileSync(path.join(out, 'packet.md'), buildPacketMarkdown(items, meta));
  writeFileSync(path.join(out, 'packet.json'), JSON.stringify(items, null, 1));
  writeFileSync(
    path.join(out, 'decisions-template.json'),
    JSON.stringify(decisionsTemplate(items, meta), null, 2),
  );
  console.log(`[tipwire] wrote ${out}/packet.md, packet.json, decisions-template.json`);
}

/** `--reporter a,b` → roster entries in any `active` state (so the gate can reach inactive
 *  ones); without it, the beat roster. Unknown ids are an error, not a silent skip. */
export function resolveBeatReporters(ids?: readonly string[]): ReporterEntry[] {
  if (!ids || ids.length === 0) return beatReporters();
  return ids.map((id) => {
    const r = getReporter(id);
    if (!r) throw new Error(`unknown reporter id "${id}"`);
    return r;
  });
}
