/**
 * Health-page report refresh (#650 follow-up).
 *   GET  → current in-flight status { inFlight, startedAt } for the UI indicator.
 *   POST → trigger a regeneration of the cached reports (rate-limited; coalesced
 *          to one at a time). Public — the /system/health page is unauthenticated
 *          — so it's rate-limited and the underlying job self-coalesces.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { getRefreshStatus, startReportRefresh } from '@/lib/services/report-refresh';
import { formatError } from '@/lib/utils/api-helpers';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  try {
    // Intentional multi-method handler (GET = status, POST = trigger); exempt from
    // no-inline-method-guard via .opengrep/architecture.yml, like reviews.ts.
    if (req.method === 'GET') {
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).json(await getRefreshStatus());
      return;
    }
    if (req.method === 'POST') {
      if (!(await enforceRateLimit(req, res, RATE_LIMITS.reportRefresh))) return;
      const { started, startedAt } = await startReportRefresh();
      res.status(started ? 202 : 409).json({
        status: started ? 'started' : 'in_progress',
        startedAt,
      });
      return;
    }
    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[api/health/refresh] Error:', err);
    res.status(500).json({ error: formatError(err) });
  }
}
