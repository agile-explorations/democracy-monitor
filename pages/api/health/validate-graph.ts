import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import type { GraphInvariantResult } from '@/lib/cron/validate-graph';
import { formatError, requireDb, requireMethod } from '@/lib/utils/api-helpers';

interface StoredGraphReport {
  results: GraphInvariantResult[];
  generatedAt: string;
}

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

/**
 * Serves the derivation-graph contract report stored by the weekly snapshot
 * (#571). The validation itself full-scans documents×scores and exceeds the
 * web proxy timeout, so it never runs on request here; ?fresh=1 forces an
 * inline run for local development only.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  try {
    if (req.query.fresh === '1') {
      const { runGraphValidation } = await import('@/lib/cron/validate-graph');
      const report: StoredGraphReport = {
        results: await runGraphValidation(),
        generatedAt: new Date().toISOString(),
      };
      await cacheSet(CacheKeys.validateGraph(), report, THIRTY_DAYS_SECONDS);
      return res.status(200).json(report);
    }
    const stored = await cacheGet<StoredGraphReport>(CacheKeys.validateGraph());
    if (stored) return res.status(200).json(stored);
    return res.status(200).json({ results: null, pending: true });
  } catch (err) {
    console.error('[api/health/validate-graph] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
