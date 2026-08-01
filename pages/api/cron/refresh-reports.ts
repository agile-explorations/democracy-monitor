/**
 * POST /api/cron/refresh-reports — regenerate the stored Health-page reports
 * (derivation-graph invariants + data readiness) on demand.
 *
 * The weekly snapshot cron stores these after each Monday run (#571 pattern:
 * the full-scan queries exceed the web proxy timeout, so /system/health
 * serves stored copies). After a mid-week repair or re-derivation the stored
 * reports go stale until the next cron — this endpoint refreshes them from
 * inside the web service, where the shared Redis is reachable.
 *
 * Protected by CRON_SECRET bearer token. Responds 202 immediately and runs
 * the validations in the background (~1–3 min); the Health page picks up the
 * new generatedAt stamps when they land. Concurrent calls are coalesced.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { startReportRefresh } from '@/lib/services/report-refresh';
import { requireMethod, safeEqual } from '@/lib/utils/api-helpers';

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

  const { started, startedAt } = await startReportRefresh();
  if (!started) {
    res.status(409).json({ status: 'in_progress', startedAt });
    return;
  }
  res.status(202).json({
    status: 'started',
    startedAt,
    note: 'Stored reports update in ~1-3 minutes; check generatedAt on /api/health/validate-graph and /api/health/validate-data.',
  });
}
