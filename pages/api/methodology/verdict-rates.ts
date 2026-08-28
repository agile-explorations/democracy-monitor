/**
 * GET /api/methodology/verdict-rates — era-sliced Pass-1/Pass-2 rates (#772)
 * for the methodology page. Seven aggregate scans; cached a day (the
 * assessment set changes on Monday).
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { computeEraVerdictRates } from '@/lib/services/verdict-rates';
import type { VerdictRatesReport } from '@/lib/services/verdict-rates';
import { requireDb, requireMethod } from '@/lib/utils/api-helpers';

const ONE_DAY_SECONDS = 86400;

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;
  const key = CacheKeys.methodologyVerdictRates();
  let report = await cacheGet<VerdictRatesReport>(key);
  if (!report) {
    report = await computeEraVerdictRates();
    await cacheSet(key, report, ONE_DAY_SECONDS);
  }
  res.setHeader('Cache-Control', `public, max-age=${ONE_DAY_SECONDS}`);
  res.status(200).json(report);
}
