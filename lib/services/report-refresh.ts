/**
 * On-demand regeneration of the stored Health-page reports (#650 follow-up).
 *
 * The heavy graph/data validations exceed the web timeout, so /system/health
 * serves cached copies; this regenerates them (~1-3 min). State is a cache-backed
 * lock (not an in-memory flag) so it's queryable by the public status endpoint
 * and coalesced across instances — the UI can show an in-flight indicator.
 */

import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { tryStoreDataReport, tryValidateGraph } from '@/lib/cron/snapshot-poststeps';
import { formatError } from '@/lib/utils/api-helpers';

/** Auto-clears the lock if a refresh dies mid-run (e.g. instance recycle). */
const LOCK_TTL_S = 15 * 60;
/** How long a finished status lingers so the UI can see it just completed. */
const DONE_TTL_S = 30;

interface RefreshLock {
  status: 'running' | 'done';
  startedAt: string;
  finishedAt?: string;
}

export interface RefreshStatus {
  inFlight: boolean;
  startedAt: string | null;
}

export async function getRefreshStatus(): Promise<RefreshStatus> {
  const lock = await cacheGet<RefreshLock>(CacheKeys.reportRefresh());
  const inFlight = lock?.status === 'running';
  return { inFlight, startedAt: inFlight ? lock.startedAt : null };
}

/**
 * Start a refresh unless one is already running. Returns whether a new run
 * started and the startedAt of the run that is now in flight.
 */
export async function startReportRefresh(): Promise<{ started: boolean; startedAt: string }> {
  const lock = await cacheGet<RefreshLock>(CacheKeys.reportRefresh());
  if (lock?.status === 'running') return { started: false, startedAt: lock.startedAt };

  const startedAt = new Date().toISOString();
  await cacheSet(CacheKeys.reportRefresh(), { status: 'running', startedAt }, LOCK_TTL_S);
  void runRefresh(startedAt);
  return { started: true, startedAt };
}

async function runRefresh(startedAt: string): Promise<void> {
  const errors: string[] = [];
  try {
    await tryValidateGraph(errors);
    await tryStoreDataReport(errors);
  } catch (err) {
    errors.push(formatError(err));
  } finally {
    await cacheSet(
      CacheKeys.reportRefresh(),
      { status: 'done', startedAt, finishedAt: new Date().toISOString() },
      DONE_TTL_S,
    );
  }
  if (errors.length > 0) console.error('[report-refresh] completed with errors:', errors);
  else console.log('[report-refresh] stored reports refreshed');
}
