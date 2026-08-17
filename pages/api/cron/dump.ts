/**
 * POST /api/cron/dump — start a diskless database dump in the background.
 *
 * Protected by CRON_SECRET bearer token. Inserts a dump_runs row and spawns
 * lib/cron/stream-dump.ts detached (pg_dump streams straight to B2 — no
 * local staging, #731), then returns 202 immediately. Poll
 * GET /api/cron/dump/status to learn when it finishes.
 *
 * Concurrency guard: a 'running' row with a fresh heartbeat blocks a new
 * run (409); a stale-heartbeat row (runner died — e.g. instance recycled)
 * is marked failed and reclaimed so one crash can't block the weekly cron
 * indefinitely (#639).
 */

import { spawn } from 'child_process';
import { and, eq, gt, lt } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { DUMP_HEARTBEAT_STALE_MS } from '@/lib/cron/dump-config';
import { getDb } from '@/lib/db';
import { dumpRuns } from '@/lib/db/schema';
import { formatError, requireDb, requireMethod, safeEqual } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'POST')) return;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'CRON_SECRET not configured' });
    return;
  }
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !safeEqual(token, secret)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  if (!requireDb(res)) return;

  try {
    const db = getDb();
    const staleBefore = new Date(Date.now() - DUMP_HEARTBEAT_STALE_MS);

    const live = await db
      .select({ id: dumpRuns.id })
      .from(dumpRuns)
      .where(and(eq(dumpRuns.status, 'running'), gt(dumpRuns.heartbeatAt, staleBefore)))
      .limit(1);
    if (live.length > 0) {
      res.status(409).json({ error: 'Dump already in progress', status: 'in_progress' });
      return;
    }

    // Reclaim orphans: running rows whose runner stopped heartbeating.
    await db
      .update(dumpRuns)
      .set({ status: 'failed', error: 'runner died (stale heartbeat)', finishedAt: new Date() })
      .where(and(eq(dumpRuns.status, 'running'), lt(dumpRuns.heartbeatAt, staleBefore)));

    const startedAt = new Date();
    const inserted = await db
      .insert(dumpRuns)
      .values({ status: 'running', startedAt, heartbeatAt: startedAt })
      .returning({ id: dumpRuns.id });
    const runId = inserted[0].id;

    const child = spawn('npx', ['tsx', 'lib/cron/stream-dump.ts', String(runId)], {
      detached: true,
      stdio: 'ignore',
      env: process.env,
    });
    child.unref();

    res.status(202).json({ status: 'started', runId, startedAt: startedAt.toISOString() });
  } catch (err) {
    res.status(500).json({ error: formatError(err) });
  }
}
