import * as cheerio from 'cheerio';
import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { SCRAPE_CACHE_TTL_S } from '@/lib/data/cache-config';
import { isValidTrackerSource, TRACKER_CONFIGS } from '@/lib/data/tracker-sources';
import { scrapeAndParse } from '@/lib/services/tracker-service';
import { formatError } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { source } = req.query;

    if (!source || typeof source !== 'string' || !isValidTrackerSource(source)) {
      return res.status(400).json({
        error: 'Invalid source. Use: brookings, naacp, democracywatch, or progressive',
      });
    }

    const config = TRACKER_CONFIGS[source];
    const cacheKey = CacheKeys.scrapeTracker(source);

    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', `public, s-maxage=${SCRAPE_CACHE_TTL_S}`);
      return res.status(200).json({ cached: true, ...cached });
    }

    const response = await fetch(config.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch ${source}: ${response.status}`,
      });
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const result = scrapeAndParse($, config, source);

    await cacheSet(cacheKey, result, SCRAPE_CACHE_TTL_S);

    res.setHeader('Cache-Control', `public, s-maxage=${SCRAPE_CACHE_TTL_S}`);
    res.status(200).json({ cached: false, ...result });
  } catch (err) {
    res.status(500).json({ error: formatError(err) });
  }
}
