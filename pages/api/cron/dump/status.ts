/**
 * GET /api/cron/dump/status — report the state of the last/current dump.
 *
 * Protected by CRON_SECRET. The weekly-dump cron polls this after triggering
 * POST /api/cron/dump; it greps for `"status":"complete|failed|running"`,
 * so those exact strings are the contract. Backed by the dump_runs table
 * (#731 — the persistent disk and its result/log files are gone).
 *
 * Statuses: running | stale (runner heartbeat stopped) | complete | failed
 * | not_run.
 */

import { desc } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { DUMP_HEARTBEAT_STALE_MS } from '@/lib/cron/dump-config';
import { getDb } from '@/lib/db';
import { dumpRuns } from '@/lib/db/schema';
import { formatError, requireDb, requireMethod, safeEqual } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'GET')) return;

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
  res.setHeader('Cache-Control', 'no-store');

  try {
    const rows = await getDb().select().from(dumpRuns).orderBy(desc(dumpRuns.startedAt)).limit(1);
    if (rows.length === 0) {
      res.status(200).json({ status: 'not_run' });
      return;
    }
    const run = rows[0];
    if (run.status === 'running') {
      const ageMs = Date.now() - run.heartbeatAt.getTime();
      res.status(200).json({
        status: ageMs > DUMP_HEARTBEAT_STALE_MS ? 'stale' : 'running',
        runId: run.id,
        startedAt: run.startedAt.toISOString(),
        heartbeatAgeS: Math.round(ageMs / 1000),
        sizeBytes: run.sizeBytes,
      });
      return;
    }
    res.status(200).json({
      status: run.status,
      runId: run.id,
      startedAt: run.startedAt.toISOString(),
      completedAt: run.finishedAt?.toISOString() ?? null,
      sizeBytes: run.sizeBytes,
      durationS: run.durationS,
      sha256: run.sha256,
      verified: run.verified,
      offsite: run.offsite ?? { database: null, piiTables: null, download: null },
      ...(run.status === 'failed' ? { error: run.error, logTail: run.logTail } : {}),
    });
  } catch (err) {
    res.status(500).json({ status: 'unknown', error: formatError(err) });
  }
}
