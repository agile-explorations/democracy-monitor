import type { NextApiRequest, NextApiResponse } from 'next';
import { getAllowedHosts } from '@/lib/allowedHosts';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { FEED_CACHE_TTL_S } from '@/lib/data/cache-config';
import { BROWSER_HEADERS, parseUpstreamResponse } from '@/lib/services/proxy-parser';
import { formatError } from '@/lib/utils/api-helpers';

const CACHE_TTL_S = Number(process.env.PROXY_CACHE_TTL) || FEED_CACHE_TTL_S;

function okHost(u: URL) {
  return getAllowedHosts().includes(u.hostname);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const target = (req.query.url || req.query.target) as string | undefined;
    if (!target) {
      res.status(400).json({ error: 'Missing url parameter (e.g., /api/proxy?url=https://...)' });
      return;
    }
    const url = new URL(decodeURIComponent(target));

    if (!okHost(url)) {
      res.status(403).json({ error: 'Host not allowed by proxy whitelist.' });
      return;
    }

    const key = CacheKeys.proxy(url.toString());
    const cached = await cacheGet<Record<string, unknown>>(key);
    if (cached) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', `public, s-maxage=${CACHE_TTL_S}`);
      res.status(200).json({ cached: true, data: cached });
      return;
    }

    const upstream = await fetch(url.toString(), { headers: BROWSER_HEADERS, cache: 'no-store' });
    if (!upstream.ok) {
      res
        .status(upstream.status)
        .json({ error: `Upstream error: ${upstream.status} ${upstream.statusText}` });
      return;
    }

    const contentType = upstream.headers.get('content-type') || '';
    const text = await upstream.text();
    const parsed = await parseUpstreamResponse(text, contentType, url);
    const out: Record<string, unknown> = {
      url: url.toString(),
      contentType,
      status: upstream.status,
      ...parsed,
    };

    await cacheSet(key, out, CACHE_TTL_S);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', `public, s-maxage=${CACHE_TTL_S}`);
    res.status(200).json({ cached: false, data: out });
  } catch (err) {
    res.status(500).json({ error: formatError(err) });
  }
}
