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
import { tryStoreDataReport, tryValidateGraph } from '@/lib/cron/snapshot-poststeps';
import { requireMethod } from '@/lib/utils/api-helpers';

let inFlight = false;

async function refresh(): Promise<void> {
  const errors: string[] = [];
  try {
    await tryValidateGraph(errors);
    await tryStoreDataReport(errors);
  } finally {
    inFlight = false;
  }
  if (errors.length > 0) {
    console.error('[refresh-reports] completed with errors:', errors);
  } else {
    console.log('[refresh-reports] stored reports refreshed');
  }
}

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (!requireMethod(req, res, 'POST')) return;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'CRON_SECRET not configured' });
    return;
  }
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  if (inFlight) {
    res.status(409).json({ status: 'in_progress' });
    return;
  }
  inFlight = true;

  // Fire-and-forget by design: the validations outlive the HTTP response
  // (Render runs a persistent Node server, not serverless). Failures are
  // logged and leave the previous stored reports in place.
  void refresh();

  res.status(202).json({
    status: 'started',
    note: 'Stored reports update in ~1-3 minutes; check generatedAt on /api/health/validate-graph and /api/health/validate-data.',
  });
}
