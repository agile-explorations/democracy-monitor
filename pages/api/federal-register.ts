import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { FEED_CACHE_TTL_S } from '@/lib/data/cache-config';
import { formatError } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { agency, type, term } = req.query;

    // Build Federal Register API URL
    const params = new URLSearchParams();
    params.set('per_page', '20');
    params.set('order', 'newest');

    if (agency) {
      params.set('conditions[agencies][]', agency as string);
    }
    if (type) {
      params.set('conditions[type][]', type as string);
    }
    if (term) {
      params.set('conditions[term]', term as string);
    }

    const url = `https://www.federalregister.gov/api/v1/documents.json?${params.toString()}`;
    const cacheKey = CacheKeys.federalRegister(url);

    // Check cache
    const cached = await cacheGet<Record<string, unknown>>(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', `public, s-maxage=${FEED_CACHE_TTL_S}`);
      return res.status(200).json({ cached: true, ...cached });
    }

    // Fetch from Federal Register API (CORS-enabled, no key needed)
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DemocracyMonitor/1.0',
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Federal Register API error: ${response.status}`,
      });
    }

    const data = await response.json();

    // Transform to our format
    const items = (data.results || []).map(
      (doc: {
        title?: string;
        html_url?: string;
        publication_date?: string;
        agencies?: { name: string }[];
        type?: string;
        abstract?: string;
      }) => ({
        title: doc.title,
        link: doc.html_url,
        pubDate: doc.publication_date,
        agency: doc.agencies?.map((a) => a.name).join(', '),
        type: doc.type,
        summary: doc.abstract,
      }),
    );

    const result = {
      type: 'federal_register',
      items,
      count: data.count,
      url,
    };

    await cacheSet(cacheKey, result, FEED_CACHE_TTL_S);

    res.setHeader('Cache-Control', `public, s-maxage=${FEED_CACHE_TTL_S}`);
    res.status(200).json({ cached: false, ...result });
  } catch (err) {
    res.status(500).json({ error: formatError(err) });
  }
}
