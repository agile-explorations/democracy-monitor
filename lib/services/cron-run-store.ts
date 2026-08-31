import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { cronRuns } from '@/lib/db/schema';

export type CronJobName = 'snapshot' | 'legiscan' | 'dump';
export type CronRunStatus = 'running' | 'success' | 'partial' | 'skipped' | 'failed';

export interface CronRun {
  id: number;
  jobName: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  summary: Record<string, unknown> | null;
  errors: string[] | null;
}

/** A 'running' row older than this without a finish is a dead runner
 *  (#829): snapshot's longest legitimate runs are ~1h; a container that
 *  OOM-killed or was recycled never calls finishCronRun. */
export const CRON_RUN_STALE_MS = 12 * 60 * 60 * 1000;

/** Insert a 'running' row and return the row ID. Self-heals first (#829):
 *  same-job rows still 'running' after CRON_RUN_STALE_MS are marked failed
 *  so a dead runner cannot shadow real results forever (runs 58/60,
 *  2026-08-24/31 OOM incidents). */
export async function startCronRun(jobName: CronJobName): Promise<number> {
  if (!isDbAvailable()) return -1;
  const db = getDb();
  await db
    .update(cronRuns)
    .set({
      status: 'failed',
      finishedAt: sql`NOW()`,
      errors: ['stale — runner died without finishing (marked by the next run)'],
    })
    .where(
      and(
        eq(cronRuns.jobName, jobName),
        eq(cronRuns.status, 'running'),
        lt(cronRuns.startedAt, new Date(Date.now() - CRON_RUN_STALE_MS)),
      ),
    );
  const [row] = await db
    .insert(cronRuns)
    .values({ jobName, status: 'running' })
    .returning({ id: cronRuns.id });
  return row.id;
}

/** Update a cron_run row with final status, duration, summary, and errors. */
export async function finishCronRun(
  id: number,
  status: CronRunStatus,
  summary: Record<string, unknown>,
  errors: string[],
): Promise<void> {
  if (!isDbAvailable() || id < 0) return;
  const db = getDb();
  await db
    .update(cronRuns)
    .set({
      status,
      finishedAt: sql`NOW()`,
      durationMs: sql<number>`EXTRACT(EPOCH FROM (NOW() - ${cronRuns.startedAt})) * 1000`,
      summary,
      errors,
    })
    .where(eq(cronRuns.id, id));
}

/** Get the most recent cron_run for a given job. */
export async function getLatestRun(jobName: CronJobName): Promise<CronRun | null> {
  if (!isDbAvailable()) return null;
  const db = getDb();
  const rows = await db
    .select()
    .from(cronRuns)
    .where(eq(cronRuns.jobName, jobName))
    .orderBy(desc(cronRuns.startedAt))
    .limit(1);

  if (rows.length === 0) return null;
  const r = rows[0];
  return {
    id: r.id,
    jobName: r.jobName,
    status: r.status,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString() ?? null,
    durationMs: r.durationMs,
    summary: r.summary as Record<string, unknown> | null,
    errors: r.errors,
  };
}
