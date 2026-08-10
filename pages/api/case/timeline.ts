import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { CASE_TIMELINE_CACHE_TTL_S } from '@/lib/data/cache-config';
import { buildCaseTimeline, fetchDocketEntries, parseCaseId } from '@/lib/services/docket-timeline';
import type { CaseTimeline } from '@/lib/services/docket-timeline';
import { formatError, requireMethod } from '@/lib/utils/api-helpers';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit';

/**
 * GET /api/case/timeline?caseId=cl:NNN — cached CourtListener docket-timeline
 * proxy for the CaseContext disclosure + research posture line (#687).
 * Redis-cached 24h; asOf inside the payload is captured at CL-fetch time so
 * the "docket as of" stamp reports data age across cache hits. CL failures
 * return 502 and are never cached. No Postgres access — cache + CL only.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'GET')) return;
  if (!(await enforceRateLimit(req, res, RATE_LIMITS.caseTimeline))) return;

  const caseId = String(req.query.caseId ?? '');
  const docketId = parseCaseId(caseId);
  if (docketId === null) {
    res.status(400).json({ error: 'Invalid caseId (expected cl:<docketId>)' });
    return;
  }

  try {
    const cached = await cacheGet<CaseTimeline>(CacheKeys.caseTimeline(docketId));
    if (cached !== null && typeof cached === 'object' && 'entries' in cached) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
      res.status(200).json(cached);
      return;
    }

    const page = await fetchDocketEntries(docketId);
    const timeline = buildCaseTimeline(caseId, docketId, page, new Date().toISOString());
    await cacheSet(CacheKeys.caseTimeline(docketId), timeline, CASE_TIMELINE_CACHE_TTL_S);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    res.status(200).json(timeline);
  } catch (err) {
    console.error(`[api/case/timeline] Failed for ${caseId}:`, err);
    res.status(502).json({ error: 'timeline unavailable', detail: formatError(err) });
  }
}
