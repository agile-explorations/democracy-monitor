import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { formatError, requireDb, requireMethod } from '@/lib/utils/api-helpers';

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

/**
 * Serves the data-readiness report stored by the weekly snapshot. The
 * validation full-scans documents×scores and exceeds the web proxy timeout
 * (observed 60s cutoffs in prod), so it never runs on request here; ?fresh=1
 * forces an inline run for local development only.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  try {
    if (req.query.fresh === '1') {
      const { runDataValidation } = await import('@/lib/services/data-validation-service');
      const report = { ...(await runDataValidation()), generatedAt: new Date().toISOString() };
      await cacheSet(CacheKeys.validateData(), report, THIRTY_DAYS_SECONDS);
      return res.status(200).json(report);
    }
    const stored = await cacheGet<Record<string, unknown>>(CacheKeys.validateData());
    if (stored) return res.status(200).json(stored);
    return res.status(200).json({ pending: true });
  } catch (err) {
    console.error('[api/health/validate-data] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
