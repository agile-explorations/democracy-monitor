/**
 * Snapshot post-steps for the completed week: narratives, headline, term
 * summary, the derivation-graph contract check (#571), and the gated digest
 * send. Extracted from snapshot.ts (max-lines); each step is non-fatal and
 * reports through the shared errors channel.
 */

import type { AggregateFailure } from '@/lib/cron/snapshot-layers';
import { evaluateDigestGate } from '@/lib/services/digest-gate';
import type { DigestGateInput } from '@/lib/services/digest-gate';
import {
  generateNarrativesForWeek,
  regenerateTermSummaryIfStale,
  retryFailedNarratives,
} from '@/lib/services/narrative-pipeline';
import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import { formatError } from '@/lib/utils/api-helpers';

/** Retry failed weekly aggregates once (transient DB errors). */
export async function retryFailedAggregates(
  failedAggregates: AggregateFailure[],
  errors: string[],
): Promise<number> {
  let aggregateRetries = 0;
  for (const { category, weekOf } of failedAggregates) {
    try {
      const agg = await computeWeeklyAggregate(category, weekOf);
      await storeWeeklyAggregate(agg);
      aggregateRetries++;
      console.log(`[snapshot] Retry succeeded for ${category}/${weekOf}`);
    } catch (err) {
      errors.push(`Aggregate retry failed for ${category}/${weekOf}: ${formatError(err)}`);
    }
  }
  return aggregateRetries;
}

/** Regenerate the living term summary if stale (non-fatal — errors appended but don't fail snapshot). */
/** Current week's one-line event headline (#539) — non-fatal. */
export async function tryEnsureWeekHeadline(weekOf: string, errors: string[]): Promise<void> {
  try {
    const { ensureWeekHeadline } = await import('@/lib/services/week-headlines');
    const { status } = await ensureWeekHeadline(weekOf, { force: true });
    console.log(`[snapshot] Week headline: ${status}`);
  } catch (err) {
    errors.push(`Week headline failed: ${formatError(err)}`);
  }
}

export async function tryRegenerateTermSummary(errors: string[]): Promise<void> {
  const status = await regenerateTermSummaryIfStale();
  if (status === 'failed') errors.push('Term summary regeneration failed (see logs)');
}

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

/** Generate the week's narratives, then retry any failures (non-fatal). */
export interface NarrativeStepResult {
  generated: boolean;
  /** Weekly-summary number-check violations that survived revision (#700). */
  numberViolations: string[];
}

export async function tryGenerateNarratives(
  currentWeek: string,
  errors: string[],
): Promise<NarrativeStepResult> {
  let narrativesGenerated = false;
  let numberViolations: string[] = [];
  try {
    ({ numberViolations } = await generateNarrativesForWeek(currentWeek));
    narrativesGenerated = true;
    for (const v of numberViolations) errors.push(`weekly summary number check: ${v}`);
  } catch (err) {
    errors.push(`Narrative generation failed: ${formatError(err)}`);
  }
  try {
    const { resolved: retried } = await retryFailedNarratives(currentWeek);
    if (retried > 0) console.log(`[snapshot] Retried ${retried} failed narratives`);
  } catch (err) {
    console.warn('[snapshot] Narrative retry failed:', err);
  }
  return { generated: narrativesGenerated, numberViolations };
}

/**
 * Score reconciliation (#667): late-published documents (LegiScan, GovInfo,
 * OIG, FR) land outside the two-week sweep; scoring them here, before the
 * graph check, is what stops G1a from holding the digest every Monday.
 * Returns the number of category-weeks reconciled.
 */
export async function tryReconcileUnscoredDocs(errors: string[]): Promise<number> {
  try {
    const { reconcileUnscoredDocs } = await import('@/lib/cron/score-reconciliation');
    const result = await reconcileUnscoredDocs();
    errors.push(...result.errors);
    console.log(
      `[snapshot] reconciled ${result.reconciled} category-week(s), ${result.docsScored} docs` +
        (result.plan.deferred.length > 0 ? ` (${result.plan.deferred.length} deferred)` : '') +
        (result.plan.baseline.length > 0
          ? ` (${result.plan.baseline.length} baseline, skipped)`
          : ''),
    );
    return result.reconciled;
  } catch (err) {
    errors.push(`score reconciliation failed to run: ${formatError(err)}`);
    return 0;
  }
}

/**
 * Post-run derivation-graph contract check (#571). Runs after every write the
 * snapshot performs so it sees the final state; error-severity violations are
 * appended to the cron error channel (and render on /system/health via
 * /api/health/validate-graph) without failing the snapshot.
 */
export async function tryValidateGraph(errors: string[]): Promise<number> {
  try {
    const { runGraphValidation } = await import('@/lib/cron/validate-graph');
    const results = await runGraphValidation();
    const failed = results.filter((r) => !r.pass && r.severity === 'error');
    for (const r of failed) {
      const sample = r.sample?.length ? ` e.g. ${r.sample.join('; ')}` : '';
      errors.push(
        `validate:graph ${r.id} — ${r.violations} violations (${r.description})${sample}`,
      );
    }
    console.log(
      `[snapshot] validate:graph: ${failed.length === 0 ? 'all invariants hold' : `${failed.length} VIOLATED`}`,
    );
    // The full-scan queries exceed the web proxy timeout, so the Health page
    // serves this stored copy instead of validating on request (#571).
    const { cacheSet } = await import('@/lib/cache');
    const { CacheKeys } = await import('@/lib/cache/keys');
    await cacheSet(
      CacheKeys.validateGraph(),
      { results, generatedAt: new Date().toISOString() },
      THIRTY_DAYS_SECONDS,
    );
    return failed.length;
  } catch (err) {
    errors.push(`validate:graph failed to run: ${formatError(err)}`);
    // A validation that cannot run counts as a violation for gating purposes.
    return 1;
  }
}

/**
 * Store the data-readiness report for the Health page (#571 pattern): its
 * full-scan queries exceed the web proxy timeout, so the page serves this
 * weekly stored copy. Non-fatal — a missing report renders as "pending".
 */

/** Weekly tracked_cases refresh (#695) — non-fatal; the tracker is a display
 * surface, never a snapshot blocker. */
export async function tryRefreshTrackedCases(errors: string[]): Promise<void> {
  try {
    const { refreshTrackedCases } = await import('@/lib/cron/refresh-tracked-cases');
    const summary = await refreshTrackedCases();
    console.log(`[snapshot] tracked_cases refresh — ${summary}`);
  } catch (err) {
    errors.push(`tracked_cases refresh failed: ${formatError(err)}`);
  }
}

export async function tryStoreDataReport(errors: string[]): Promise<void> {
  try {
    const { runDataValidation } = await import('@/lib/services/data-validation-service');
    const report = await runDataValidation();
    const { cacheSet } = await import('@/lib/cache');
    const { CacheKeys } = await import('@/lib/cache/keys');
    await cacheSet(
      CacheKeys.validateData(),
      { ...report, generatedAt: new Date().toISOString() },
      THIRTY_DAYS_SECONDS,
    );
    console.log('[snapshot] validate:data report stored for Health page');
  } catch (err) {
    errors.push(`validate:data report failed: ${formatError(err)}`);
  }
}

/**
 * Post-run per-source funnel check (#547). Runs after the snapshot's writes so
 * it sees the final state; error-tier stage collapses (a source with real
 * retrieved volume but ~nothing surviving relevance/P1, vs its category
 * siblings) are appended to the cron error channel — which the snapshot funnels
 * into the ops-alert email — so a contamination like #524 pages the owner
 * automatically. Non-fatal: it never fails the snapshot.
 */
export async function tryValidateFunnel(errors: string[]): Promise<number> {
  try {
    const { runFunnelValidation } = await import('@/lib/services/funnel-validation-service');
    const { collapses, health } = await runFunnelValidation();
    const failed = collapses.filter((c) => c.severity === 'error');
    for (const c of failed) {
      errors.push(`validate:funnel ${c.id} — ${c.reason}`);
    }
    // Detection-health warns (#840) are calibration signals: logged for the
    // owner's Monday review, never pushed to the error channel.
    for (const h of health) {
      console.log(`[snapshot] detection-health ⚠ ${h.id}: ${h.reason}`);
    }
    console.log(
      `[snapshot] validate:funnel: ${failed.length === 0 ? 'no source collapses' : `${failed.length} COLLAPSE(S)`} · ${health.length} health warn(s)`,
    );
    return failed.length;
  } catch (err) {
    errors.push(`validate:funnel failed to run: ${formatError(err)}`);
    return 1;
  }
}

/**
 * Weekly incremental detector (#704/#706 follow-up): a newly ingested
 * whole-day multi-topic CREC granule (e.g. a conference-report-style record)
 * needs `pnpm crec:build-fragments` re-run to restore per-speech retrieval
 * granularity. Advisory only — reported in the run summary, never gates the
 * digest. The standing full-corpus twin lives in validate:ingest.
 */
export async function tryWarnUnfragmentedCrec(errors: string[]): Promise<void> {
  try {
    const { countUnfragmentedCrecGranules } =
      await import('@/lib/services/ingest-validation-queries');
    const n = await countUnfragmentedCrecGranules(8);
    if (n > 0) {
      const msg =
        `${n} whole-day multi-topic CREC granule(s) ingested this week — ` +
        `run: pnpm crec:build-fragments --confirm (idempotent, #704)`;
      errors.push(msg);
      console.warn(`[snapshot] ${msg}`);
    }
  } catch (err) {
    errors.push(`unfragmented-CREC check failed to run: ${formatError(err)}`);
  }
}

/**
 * Send the digest only when the run's quality signals are clean — ingest
 * failures can yield an internally consistent but grossly wrong narrative.
 * A held digest is released with `pnpm digest:send --week <date>` after
 * review (owner decision, 2026-07-25).
 */
export async function gateAndSendDigest(
  currentWeek: string,
  gateInput: DigestGateInput,
  errors: string[],
): Promise<void> {
  const gate = evaluateDigestGate(gateInput);
  if (gate.send) {
    await trySendWeeklyDigest(currentWeek, errors);
    return;
  }
  const msg =
    `Digest HELD for ${currentWeek}: ${gate.holdReasons.join('; ')} — ` +
    `review, then release with: pnpm digest:send --week ${currentWeek}`;
  errors.push(msg);
  console.warn(`[snapshot] ${msg}`);
}

/** Send weekly digest email to subscribers (non-fatal — errors appended but don't fail snapshot). */
async function trySendWeeklyDigest(weekOf: string, errors: string[]): Promise<void> {
  try {
    const { sendWeeklyDigest } = await import('@/lib/services/subscriber-service');
    const sent = await sendWeeklyDigest(weekOf);
    if (sent > 0) console.log(`[snapshot] Weekly digest sent to ${sent} subscribers`);
  } catch (err) {
    errors.push(`Weekly digest failed: ${formatError(err)}`);
  }
}

/** Weekly hot-entity salience index refresh (#757) — non-fatal, last step:
 *  search quality degrades gracefully to seed-only retrieval without it. */
export async function tryRefreshHotEntities(errors: string[]): Promise<void> {
  try {
    const { refreshHotEntities } = await import('@/lib/cron/refresh-hot-entities');
    const r = await refreshHotEntities({ dryRun: false });
    console.log(
      `[snapshot] hot entities: ${r.written} written, ${r.junctionRows} mention rows (${r.docsScanned} docs scanned)`,
    );
  } catch (err) {
    errors.push(`Hot-entity refresh failed: ${formatError(err)}`);
  }
}
