import type { NextApiRequest, NextApiResponse } from 'next';
import * as cheerio from 'cheerio';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { getDemoResponse } from '@/lib/demo';

const CACHE_TTL_S = 3600; // 1 hour

type TrackerSource = 'brookings' | 'naacp' | 'democracywatch' | 'progressive';

const TRACKER_CONFIGS: Record<TrackerSource, {
  url: string;
  selector: string;
  titleSelector: string;
  linkSelector: string;
  dateSelector?: string;
}> = {
  brookings: {
    url: 'https://www.brookings.edu/articles/tracking-regulatory-changes-in-the-second-trump-administration/',
    selector: '.post-content table tr',
    titleSelector: 'td:first-child',
    linkSelector: 'td a',
    dateSelector: 'td:nth-child(2)'
  },
  naacp: {
    url: 'https://www.naacpldf.org/tracking-project-2025/',
    selector: '.tracking-item, article',
    titleSelector: 'h3, .title, h2',
    linkSelector: 'a'
  },
  democracywatch: {
    url: 'https://www.democracywatchtracker.org/',
    selector: '.legislation-item, .tracker-item',
    titleSelector: '.title, h3',
    linkSelector: 'a'
  },
  progressive: {
    url: 'https://progressivereform.org/tracking-trump-2/project-2025-executive-action-tracker/',
    selector: '.entry-content li, .tracker-list li',
    titleSelector: 'a, strong',
    linkSelector: 'a'
  }
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const demo = getDemoResponse('scrape-tracker', req);
  if (demo) return res.status(200).json(demo);

  try {
    const { source } = req.query;

    if (!source || typeof source !== 'string' || !(source in TRACKER_CONFIGS)) {
      return res.status(400).json({
        error: 'Invalid source. Use: brookings, naacp, democracywatch, or progressive'
      });
    }

    const config = TRACKER_CONFIGS[source as TrackerSource];
    const cacheKey = CacheKeys.scrapeTracker(source);

    // Check cache
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600');
      return res.status(200).json({ cached: true, ...cached });
    }

    // Fetch the tracker page
    const response = await fetch(config.url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Failed to fetch ${source}: ${response.status}`
      });
    }

    const html = await response.text();
    const $ = cheerio.load(html);

    const items: Array<{ title: string; link?: string; date?: string }> = [];

    $(config.selector).each((_, elem) => {
      const $elem = $(elem);
      const title = $elem.find(config.titleSelector).first().text().trim();
      const link = $elem.find(config.linkSelector).first().attr('href');
      const date = config.dateSelector ? $elem.find(config.dateSelector).text().trim() : undefined;

      if (title && title.length > 3) {
        items.push({
          title,
          link: link?.startsWith('http') ? link : (link ? new URL(link, config.url).toString() : config.url),
          date
        });
      }
    });

    const result = {
      type: 'tracker_scrape',
      source,
      sourceUrl: config.url,
      items: items.slice(0, 15),
      scrapedAt: new Date().toISOString()
    };

    await cacheSet(cacheKey, result, CACHE_TTL_S);

    res.setHeader('Cache-Control', 'public, s-maxage=3600');
    res.status(200).json({ cached: false, ...result });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
