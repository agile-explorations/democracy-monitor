import type { NextApiRequest, NextApiResponse } from 'next';
import { parseStringPromise } from 'xml2js';
import { getAllowedHosts } from '@/lib/allowedHosts';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { FEED_CACHE_TTL_S } from '@/lib/data/cache-config';
import { formatError } from '@/lib/utils/api-helpers';
const CACHE_TTL_S = Number(process.env.PROXY_CACHE_TTL) || FEED_CACHE_TTL_S;

const ANCHOR_RE = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate',
  DNT: '1',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

function okHost(u: URL) {
  return getAllowedHosts().includes(u.hostname);
}

function extractAnchors(
  text: string,
  baseUrl: URL,
  maxAnchors: number,
): Array<{ href: string; text: string }> {
  return Array.from(text.matchAll(ANCHOR_RE))
    .slice(0, maxAnchors)
    .map((m) => ({
      href: m[1].startsWith('http') ? m[1] : new URL(m[1], baseUrl).toString(),
      text: m[2].replace(/<[^>]*>/g, '').trim(),
    }));
}

async function parseUpstreamResponse(
  text: string,
  contentType: string,
  baseUrl: URL,
): Promise<Record<string, unknown>> {
  if (
    text.includes('Access Denied') ||
    text.includes('403 Forbidden') ||
    text.includes('blocked')
  ) {
    return { type: 'error', error: 'Access denied by remote server', raw: text.slice(0, 500) };
  }
  if (
    contentType.includes('xml') ||
    contentType.includes('rss') ||
    text.trim().startsWith('<?xml')
  ) {
    return parseXmlResponse(text, baseUrl);
  }
  if (contentType.includes('json')) {
    try {
      return { type: 'json', json: JSON.parse(text) };
    } catch {
      return { type: 'text', raw: text.slice(0, 2000) };
    }
  }
  const anchors = extractAnchors(text, baseUrl, 20).filter(
    (item) => item.text.length > 5 && !item.href.includes('javascript:'),
  );
  return { type: 'html', anchors };
}

async function parseXmlResponse(text: string, baseUrl: URL): Promise<Record<string, unknown>> {
  try {
    const parsed = await parseStringPromise(text, { explicitArray: false, mergeAttrs: true });
    const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
    return {
      type: 'rss',
      items: Array.isArray(items) ? items : items ? [items] : [],
      title: parsed?.rss?.channel?.title || parsed?.feed?.title || 'RSS Feed',
    };
  } catch {
    const anchors = extractAnchors(text, baseUrl, 15).filter(
      (item) => item.text.length > 0 && !item.text.toLowerCase().includes('skip'),
    );
    return { type: 'html', anchors };
  }
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
