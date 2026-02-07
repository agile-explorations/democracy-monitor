import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { getDemoResponse } from '@/lib/demo';

const CACHE_TTL_S = 600; // 10 minutes

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const demo = getDemoResponse('federal-register', req);
  if (demo) return res.status(200).json(demo);

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
    const cached = await cacheGet<any>(cacheKey);
    if (cached) {
      res.setHeader('Cache-Control', 'public, s-maxage=600');
      return res.status(200).json({ cached: true, ...cached });
    }

    // Fetch from Federal Register API (CORS-enabled, no key needed)
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'DemocracyMonitor/1.0'
      }
    });

    if (!response.ok) {
      return res.status(response.status).json({
        error: `Federal Register API error: ${response.status}`
      });
    }

    const data = await response.json();

    // Transform to our format
    const items = (data.results || []).map((doc: any) => ({
      title: doc.title,
      link: doc.html_url,
      pubDate: doc.publication_date,
      agency: doc.agencies?.map((a: any) => a.name).join(', '),
      type: doc.type,
      summary: doc.abstract
    }));

    const result = {
      type: 'federal_register',
      items,
      count: data.count,
      url
    };

    await cacheSet(cacheKey, result, CACHE_TTL_S);

    res.setHeader('Cache-Control', 'public, s-maxage=600');
    res.status(200).json({ cached: false, ...result });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
