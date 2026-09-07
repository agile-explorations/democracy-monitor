/**
 * Weekly CREC fragment build (#852). Runs inside the snapshot right after the
 * secondary-source ingest (CPD/CREC/CHRG) and BEFORE the embedding pass, so a
 * whole-day multi-topic Congressional Record granule ingested this week is
 * split into per-speech fragments and embedded the same night — and lands in
 * that night's 05:00 UTC dump.
 *
 * Non-fatal like every other post-step: a failure is recorded in the run's
 * error list and the snapshot continues. A GovInfo fetch miss leaves the
 * granule unmarked, so the next run retries it and the leftover advisory
 * (tryWarnUnfragmentedCrec) reports it.
 */

import { formatError } from '@/lib/utils/api-helpers';

export interface CrecFragmentBuildResult {
  candidates: number;
  processed: number;
  inserted: number;
  misses: number;
}

export interface CrecFragmentBuildDeps {
  apiKey: string | undefined;
  build: (options: { confirm: boolean; apiKey?: string }) => Promise<CrecFragmentBuildResult>;
}

async function defaultBuild(options: { confirm: boolean; apiKey?: string }) {
  const { runCrecFragmentBuild } = await import('@/lib/cron/backfill-crec-fragments');
  return runCrecFragmentBuild(options);
}

/** Summary line for the run log; exported for the test. */
export function describeFragmentBuild(r: {
  candidates: number;
  processed: number;
  inserted: number;
  misses: number;
}): string {
  return (
    `CREC fragments: ${r.candidates} candidate granule(s) → ` +
    `${r.processed} processed, ${r.inserted} fragment rows, ${r.misses} fetch miss(es)`
  );
}

/** Returns the build result, or null when the step was skipped or failed
 *  (the reason is in `errors` for a failure; a missing key only logs). */
export async function tryBuildCrecFragments(
  errors: string[],
  deps: CrecFragmentBuildDeps = { apiKey: process.env.GOVINFO_API_KEY, build: defaultBuild },
): Promise<CrecFragmentBuildResult | null> {
  if (!deps.apiKey) {
    console.warn('[snapshot] CREC fragments: GOVINFO_API_KEY not configured — step skipped');
    return null;
  }
  try {
    const result = await deps.build({ confirm: true, apiKey: deps.apiKey });
    console.log(`[snapshot] ${describeFragmentBuild(result)}`);
    if (result.misses > 0) {
      errors.push(
        `${describeFragmentBuild(result)} — missed granules stay unmarked and are retried next run`,
      );
    }
    return result;
  } catch (err) {
    errors.push(`CREC fragment build failed: ${formatError(err)}`);
    return null;
  }
}
