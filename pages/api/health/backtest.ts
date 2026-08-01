import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { BACKTEST_CACHE_TTL_S } from '@/lib/data/cache-config';
import { formatError, requireDb, requireMethod } from '@/lib/utils/api-helpers';
import { runBacktest } from '@/lib/validation/historical-backtest';
import { TRUMP_T1_EVENTS } from '@/lib/validation/known-events';

const DEFAULT_FROM = '2017-01-20';
const DEFAULT_TO = '2018-01-19';
const CACHE_KEY = `health:backtest:${DEFAULT_FROM}:${DEFAULT_TO}`;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;

  // `runBacktest` is a heavy full-year DB+compute pass, so serve a memoized
  // result (Redis, TTL ~24h). This protects the origin from repeat cost on BOTH
  // the Cloudflare path AND the direct-origin bypass (which skips edge caching);
  // the s-maxage header additionally lets Cloudflare cache it. The result is
  // deterministic for the fixed dates. (#632)
  const cached = await cacheGet<object>(CACHE_KEY);
  if (cached) {
    res.setHeader('Cache-Control', `public, s-maxage=${BACKTEST_CACHE_TTL_S}`);
    return res.status(200).json(cached);
  }

  if (!requireDb(res)) return;

  try {
    const results = await runBacktest(DEFAULT_FROM, DEFAULT_TO, TRUMP_T1_EVENTS);

    const totalDetected = results.reduce((s, r) => s + r.detectedEvents.length, 0);
    const totalLatency = results.reduce((s, r) => s + r.latencyDetectedEvents.length, 0);
    const totalMissed = results.reduce((s, r) => s + r.missedEvents.length, 0);
    const totalEvents = totalDetected + totalLatency + totalMissed;

    const payload = {
      period: `${DEFAULT_FROM} → ${DEFAULT_TO}`,
      totalEvents,
      detected: totalDetected,
      latency: totalLatency,
      missed: totalMissed,
      detectionRate:
        totalEvents > 0 ? (((totalDetected + totalLatency) / totalEvents) * 100).toFixed(0) : '0',
      categories: results.map((r) => ({
        category: r.category,
        detectionRate: (r.detectionRate * 100).toFixed(0),
        detected: r.detectedEvents.length,
        latency: r.latencyDetectedEvents.length,
        missed: r.missedEvents.length,
        noise: (r.baselineNoise * 100).toFixed(0),
        precision: (r.signalPrecision * 100).toFixed(0),
        peakWeek: r.peakWeek || null,
        missedDescriptions: r.missedEvents.map((m) => ({
          date: m.event.date,
          description: m.event.description,
          reason: m.missReason,
        })),
      })),
    };

    await cacheSet(CACHE_KEY, payload, BACKTEST_CACHE_TTL_S);
    res.setHeader('Cache-Control', `public, s-maxage=${BACKTEST_CACHE_TTL_S}`);
    return res.status(200).json(payload);
  } catch (err) {
    console.error('[api/health/backtest] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
