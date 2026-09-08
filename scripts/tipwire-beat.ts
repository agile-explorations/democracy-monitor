/**
 * R-TIPWIRE beat pass CLI (#869/#871; per category since R-TIPWIRE-4 #877).
 * `tips:dryrun --beat` is the owner-scored gate; `runBeatPass` is pass 3 of
 * the daily poll. One check per category per new Pass 2 week, listing every
 * reporter on the beat; the anchor is an in-memory placeholder, never stored.
 */

import { configureAiCallBudget, getAiCallCount } from '@/lib/services/ai-call-budget';
import type { DiscoveredArticle } from '@/lib/tipwire/acquire';
import { beatAnchor, listBeatQueue, listBeatWeeks } from '@/lib/tipwire/beat-docs';
import type { BeatQueueItem } from '@/lib/tipwire/beat-docs';
import { isInCooldown } from '@/lib/tipwire/cadence';
import type { SentRow } from '@/lib/tipwire/cadence';
import { createCoverageChecker } from '@/lib/tipwire/coverage';
import type { RetrievalScope } from '@/lib/tipwire/match';
import { runPipeline } from '@/lib/tipwire/pipeline';
import type { PipelineDeps } from '@/lib/tipwire/pipeline';
import { beatReporters } from '@/lib/tipwire/roster';
import type { ReporterEntry } from '@/lib/tipwire/roster';
import { recentTitlesFromDb } from '@/lib/tipwire/store';
import { dryRunEstimate, persistItems, resolveBeatReporters, writePacket } from './tipwire-shared';
import type { PollOutcome, TipwireArgs } from './tipwire-shared';

/** Beat dry run: Mondays to sample when --weeks is not given. */
const BEAT_DRYRUN_WEEKS = 3;

const describeItem = (q: BeatQueueItem) =>
  `${q.category} [${q.reporters.map((r) => r.id).join(', ')}] week of ${q.weekOf}: ${q.docIds.length} flagged doc(s)`;

function anchorsFor(queue: BeatQueueItem[]) {
  const anchors = queue.map((q) => beatAnchor(q.category, q.reporters, q.weekOf));
  const byKey = new Map(anchors.map((a, i) => [a.articleKey, queue[i]]));
  const scopeFor = (a: DiscoveredArticle): RetrievalScope => {
    const q = byKey.get(a.articleKey);
    return {
      kind: 'beat',
      docIds: q?.docIds ?? [],
      weekOf: q?.weekOf,
      category: q?.category,
      reporterIds: q?.reporters.map((r) => r.id) ?? [],
    };
  };
  return { anchors, scopeFor };
}

const rosterMap = (reporters: ReporterEntry[]) => new Map(reporters.map((r) => [r.id, r]));

/** Beat gate (#870/#878): one item per category × week, judged with no article anchor. */
export async function runBeatDryRun(args: TipwireArgs): Promise<number> {
  if (!args.out) throw new Error('dryrun --beat needs --out DIR');
  const weeks = args.weeks ?? BEAT_DRYRUN_WEEKS;
  const reporters = resolveBeatReporters(args.reporterIds);
  const queue = await listBeatWeeks(reporters, weeks, new Date());
  const est = dryRunEstimate(queue.length, args.maxCalls);
  for (const q of queue) console.log(`[tipwire] ${describeItem(q)}`);
  const categories = new Set(queue.map((q) => q.category)).size;
  console.log(
    `[tipwire] precheck — beat checks: ${queue.length} (${categories} categories × ${weeks} weeks over ${reporters.length} reporters, empty weeks skipped); expected AI calls: ${est.expectedCalls}; cap: ${est.cap}; est cost ~$${est.dollars.toFixed(2)}; no retrieval spend`,
  );
  if (!args.confirm) {
    console.log('[tipwire] Precheck only. Re-run with --confirm to judge and write the packet.');
    return 0;
  }
  configureAiCallBudget(est.cap);
  const { anchors, scopeFor } = anchorsFor(queue);
  const run = await runPipeline(anchors, rosterMap(reporters), {
    scopeFor,
    // The judge must see what each listed reporter actually wrote, not the batch's placeholders.
    recentTitles: (a, rid) => recentTitlesFromDb(rid, new Date(a.publishedAt ?? Date.now())),
    coverage: createCoverageChecker(),
    onItem: (it, i, n) =>
      console.log(
        `[tipwire] ${i + 1}/${n} beat ${it.beatCategory ?? it.reporter.id} week of ${it.since?.slice(0, 10)} → ${it.judge.verdict} (${it.judge.calls} call(s), ${it.match.docs.length} docs)`,
      ),
  });
  writePacket(
    args.out,
    run.items,
    `beat:${weeks}w`,
    reporters.map((r) => r.id),
  );
  console.log(
    `[tipwire] done: ${run.items.length} judged, ${run.items.filter((i) => i.judge.verdict === 'tip').length} proposed tip(s), ${getAiCallCount()} AI calls.` +
      (run.capTripped ? ' CAP TRIPPED.' : ''),
  );
  return run.capTripped ? 3 : 0;
}

/** The cadence guard, per listed reporter: held reporters (unreplied cooldown) are dropped
 *  from the listing and reported as skipped; a check with nobody left is skipped without
 *  spend. So a stored candidate never lists a reporter the owner must not send to. */
export function splitByCadence(
  queue: BeatQueueItem[],
  sent: SentRow[],
  now: Date,
  ignore: boolean,
): { keep: BeatQueueItem[]; skipped: string[] } {
  const keep: BeatQueueItem[] = [];
  const skipped = new Set<string>();
  for (const q of queue) {
    const open = ignore ? q.reporters : q.reporters.filter((r) => !isInCooldown(r.id, sent, now));
    for (const r of q.reporters) if (!open.includes(r)) skipped.add(r.id);
    if (open.length > 0) keep.push({ ...q, reporters: open });
  }
  return { keep, skipped: [...skipped] };
}

/** Pass 3 — beat (#871): one check per category with new Pass 2 documents since its last beat week. */
export async function runBeatPass(
  args: TipwireArgs,
  sent: SentRow[],
  now: Date,
  shared: PipelineDeps,
  runId: string,
  outcome: PollOutcome,
): Promise<boolean> {
  const reporters = beatReporters();
  const queue = await listBeatQueue(reporters, now);
  const { keep, skipped } = splitByCadence(queue, sent, now, args.ignoreCadence);
  outcome.beatChecks = keep.length;
  outcome.skippedForCadence = [...new Set([...outcome.skippedForCadence, ...skipped])];
  if (keep.length === 0) return false;
  const { anchors, scopeFor } = anchorsFor(keep);
  const beat = await runPipeline(anchors, rosterMap(reporters), { ...shared, scopeFor });
  await persistItems(beat.items, new Map(), runId, outcome);
  return beat.capTripped;
}
