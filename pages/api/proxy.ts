import type { NextApiRequest, NextApiResponse } from 'next';
import { parseStringPromise } from 'xml2js';
import { getAllowedHosts } from '@/lib/allowedHosts';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { getDemoResponse } from '@/lib/demo';

const CACHE_TTL_S = Number(process.env.PROXY_CACHE_TTL) || 600;

function okHost(u: URL) { return getAllowedHosts().includes(u.hostname); }

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const demo = getDemoResponse('proxy', req);
  if (demo) return res.status(200).json(demo);

  try {
    const target = (req.query.url || req.query.target) as string | undefined;
    if (!target) {
      res.status(400).json({ error: 'Missing url parameter (e.g., /api/proxy?url=https://...)' });
      return;
    }
    const decoded = decodeURIComponent(target);
    const url = new URL(decoded);

    if (!okHost(url)) {
      res.status(403).json({ error: 'Host not allowed by proxy whitelist.' });
      return;
    }

    const key = CacheKeys.proxy(url.toString());
    const cached = await cacheGet<any>(key);
    if (cached) {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', `public, s-maxage=${CACHE_TTL_S}`);
      res.status(200).json({ cached: true, data: cached });
      return;
    }

    const upstream = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate',
        'DNT': '1',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1'
      },
      cache: 'no-store'
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: `Upstream error: ${upstream.status} ${upstream.statusText}` });
      return;
    }

    const contentType = upstream.headers.get('content-type') || '';
    const text = await upstream.text();

    let out: any = { url: url.toString(), contentType, status: upstream.status };

    // Check for common error patterns
    if (text.includes('Access Denied') || text.includes('403 Forbidden') || text.includes('blocked')) {
      out.type = 'error';
      out.error = 'Access denied by remote server';
      out.raw = text.slice(0, 500);
    } else if (contentType.includes('xml') || contentType.includes('rss') || text.trim().startsWith('<?xml')) {
      try {
        const parsed = await parseStringPromise(text, { explicitArray: false, mergeAttrs: true });
        const items = parsed?.rss?.channel?.item || parsed?.feed?.entry || [];
        out.type = 'rss';
        out.items = Array.isArray(items) ? items : (items ? [items] : []);
        out.title = parsed?.rss?.channel?.title || parsed?.feed?.title || 'RSS Feed';
      } catch {
        // Try to extract links from HTML instead
        const anchors = Array.from(text.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi)).slice(0, 15)
          .map((m) => ({
            href: m[1].startsWith('http') ? m[1] : new URL(m[1], url).toString(),
            text: m[2].replace(/<[^>]*>/g, '').trim()
          }))
          .filter(item => item.text.length > 0 && !item.text.toLowerCase().includes('skip'));
        out.type = 'html';
        out.anchors = anchors;
      }
    } else if (contentType.includes('json')) {
      try {
        out.json = JSON.parse(text);
        out.type = 'json';
      } catch {
        out.type = 'text';
        out.raw = text.slice(0, 2000);
      }
    } else {
      // Extract anchors with better filtering
      const anchors = Array.from(text.matchAll(/<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi)).slice(0, 20)
        .map((m) => ({
          href: m[1].startsWith('http') ? m[1] : new URL(m[1], url).toString(),
          text: m[2].replace(/<[^>]*>/g, '').trim()
        }))
        .filter(item => item.text.length > 5 && !item.href.includes('javascript:'));
      out.type = 'html';
      out.anchors = anchors;
    }

    await cacheSet(key, out, CACHE_TTL_S);

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Cache-Control', `public, s-maxage=${CACHE_TTL_S}`);
    res.status(200).json({ cached: false, data: out });
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
