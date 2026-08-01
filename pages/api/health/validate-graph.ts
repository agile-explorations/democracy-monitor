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
 * Serves the derivation-graph contract report. The heavy invariants (G1a/G1b/G5/G6)
 * full-scan documents×scores and exceed the web timeout, so they're computed by
 * the cron and read from cache. The cheap invariants (G2/G3/G4/G4h — aggregate &
 * narrative freshness) run LIVE on each request and are merged over the cached
 * heavy results (#650), so the freshness signals reflect current state, not the
 * last snapshot. `generatedAt` = when the heavy part was computed; `liveAt` = now.
 * ?fresh=1 forces a full inline run (local development).
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

    // Run the cheap invariants live so freshness is current (#650). If the live
    // run fails, fall back to the fully-cached report.
    let live: GraphInvariantResult[] | null = null;
    let liveAt: string | null = null;
    try {
      const { runLiveInvariants } = await import('@/lib/cron/validate-graph');
      live = await runLiveInvariants();
      liveAt = new Date().toISOString();
    } catch (liveErr) {
      console.warn('[api/health/validate-graph] live invariants failed:', liveErr);
    }

    if (stored?.results) {
      const liveIds = new Set(live?.map((r) => r.id) ?? []);
      const merged = live
        ? [...stored.results.filter((r) => !liveIds.has(r.id)), ...live]
        : stored.results;
      return res
        .status(200)
        .json({ results: merged, generatedAt: stored.generatedAt, liveAt, live: !!live });
    }
    if (live) {
      return res.status(200).json({ results: live, liveAt, live: true, pending: true });
    }
    return res.status(200).json({ results: null, pending: true });
  } catch (err) {
    console.error('[api/health/validate-graph] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
