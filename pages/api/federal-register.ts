import type { NextApiRequest, NextApiResponse } from 'next';

const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const cache = new Map<string, { ts: number; data: any }>();

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
    const cacheKey = url;

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      res.setHeader('Cache-Control', 'public, s-maxage=600');
      return res.status(200).json({ cached: true, ...cached.data });
    }

    // Fetch from Federal Register API (CORS-enabled, no key needed)
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ExecutivePowerDriftDashboard/1.0'
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

    cache.set(cacheKey, { ts: Date.now(), data: result });

    res.setHeader('Cache-Control', 'public, s-maxage=600');
    res.status(200).json({ cached: false, ...result });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
