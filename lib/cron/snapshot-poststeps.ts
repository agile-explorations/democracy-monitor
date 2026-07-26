/**
 * Snapshot post-steps for the completed week: narratives, headline, term
 * summary, the derivation-graph contract check (#571), and the gated digest
 * send. Extracted from snapshot.ts (max-lines); each step is non-fatal and
 * reports through the shared errors channel.
 */

import { evaluateDigestGate } from '@/lib/services/digest-gate';
import type { DigestGateInput } from '@/lib/services/digest-gate';
import {
  generateNarrativesForWeek,
  regenerateTermSummaryIfStale,
  retryFailedNarratives,
} from '@/lib/services/narrative-pipeline';
import { formatError } from '@/lib/utils/api-helpers';

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
export async function tryGenerateNarratives(
  currentWeek: string,
  errors: string[],
): Promise<boolean> {
  let narrativesGenerated = false;
  try {
    await generateNarrativesForWeek(currentWeek);
    narrativesGenerated = true;
  } catch (err) {
    errors.push(`Narrative generation failed: ${formatError(err)}`);
  }
  try {
    const { resolved: retried } = await retryFailedNarratives(currentWeek);
    if (retried > 0) console.log(`[snapshot] Retried ${retried} failed narratives`);
  } catch (err) {
    console.warn('[snapshot] Narrative retry failed:', err);
  }
  return narrativesGenerated;
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
      errors.push(`validate:graph ${r.id} — ${r.violations} violations (${r.description})`);
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
