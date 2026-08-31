/**
 * Latest dump-run summary for health reporting (#828): the dump stopped
 * writing cron_runs when it went diskless (#731), which left
 * /api/health/cron permanently degraded ("No dump runs recorded yet").
 * The dump_runs row — heartbeat and all — is the source of truth.
 */

import { desc } from 'drizzle-orm';
import { DUMP_HEARTBEAT_STALE_MS } from '@/lib/cron/dump-config';
import { getDb, isDbAvailable } from '@/lib/db';
import { dumpRuns } from '@/lib/db/schema';

export interface DumpRunSummary {
  /** Normalized to the cron_runs vocabulary: success | failed | running. */
  status: 'success' | 'failed' | 'running';
  startedAt: string;
  durationMs: number | null;
  errors: string[] | null;
  /** True for a 'running' row whose heartbeat has gone silent — the runner died. */
  stale: boolean;
}

/** Map the newest dump_runs row into the health page's job vocabulary. */
export function summarizeDumpRun(run: {
  status: string;
  startedAt: Date;
  heartbeatAt: Date;
  durationS: number | null;
  error: string | null;
}): DumpRunSummary {
  const stale =
    run.status === 'running' && Date.now() - run.heartbeatAt.getTime() > DUMP_HEARTBEAT_STALE_MS;
  const status =
    run.status === 'complete' ? 'success' : stale || run.status === 'failed' ? 'failed' : 'running';
  return {
    status,
    startedAt: run.startedAt.toISOString(),
    durationMs: run.durationS === null ? null : run.durationS * 1000,
    errors: stale ? ['runner died (stale heartbeat)'] : run.error ? [run.error] : null,
    stale,
  };
}

export async function getLatestDumpRun(): Promise<DumpRunSummary | null> {
  if (!isDbAvailable()) return null;
  const db = getDb();
  const rows = await db
    .select({
      status: dumpRuns.status,
      startedAt: dumpRuns.startedAt,
      heartbeatAt: dumpRuns.heartbeatAt,
      durationS: dumpRuns.durationS,
      error: dumpRuns.error,
    })
    .from(dumpRuns)
    .orderBy(desc(dumpRuns.startedAt))
    .limit(1);
  if (rows.length === 0) return null;
  return summarizeDumpRun(rows[0]);
}
