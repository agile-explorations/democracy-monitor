/**
 * GET /api/health/live — readiness probe for Render's zero-downtime deploys.
 *
 * render.yaml points healthCheckPath here: Render keeps traffic on the OLD
 * instance until this returns 200 on the new one, eliminating the ~40s of
 * cutover 502s measured pre-#730. Checks actual readiness (a DB round trip),
 * not just process liveness — an instance that cannot reach Postgres must
 * not receive traffic. No auth: the response carries no data beyond status.
 *
 * The round trip runs on a dedicated single-connection pool (pingDb) so it
 * can never queue behind heavy retrieval queries on the shared pool — that
 * starvation got healthy instances evicted on 2026-08-24.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { pingDb } from '@/lib/db';
import { requireDb, requireMethod } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;
  try {
    await pingDb();
    res.status(200).json({ status: 'ok' });
  } catch {
    res.status(503).json({ status: 'db-unreachable' });
  }
}
