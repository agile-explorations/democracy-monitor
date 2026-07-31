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

/** Blocked-request signal carrying the HTTP status to return to the client. */
class ProxyBlocked extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Fetch a target without following redirects blindly. `redirect: 'manual'`
 * stops the default behavior where an allowlisted host could 30x-redirect to an
 * internal address (SSRF). At most one hop, and the redirect target must be
 * https AND on the allowlist or the request is refused.
 */
async function fetchWithinAllowlist(start: URL): Promise<Response> {
  let url = start;
  for (let hop = 0; hop < 2; hop++) {
    const resp = await fetch(url.toString(), {
      headers: BROWSER_HEADERS,
      cache: 'no-store',
      redirect: 'manual',
    });
    if (resp.status < 300 || resp.status >= 400) return resp;

    const location = resp.headers.get('location');
    if (!location) return resp;
    const next = new URL(location, url);
    if (next.protocol !== 'https:' || !okHost(next)) {
      throw new ProxyBlocked(403, 'Redirect target not allowed by proxy whitelist.');
    }
    url = next;
  }
  throw new ProxyBlocked(400, 'Too many redirects.');
}

/** Parse + validate the target URL, sending the appropriate error and
 *  returning null on failure. Scheme is pinned to https and the host must be on
 *  the allowlist (blocks file:/gopher:/http: SSRF vectors). */
function resolveTarget(req: NextApiRequest, res: NextApiResponse): URL | null {
  const target = (req.query.url || req.query.target) as string | undefined;
  if (!target) {
    res.status(400).json({ error: 'Missing url parameter (e.g., /api/proxy?url=https://...)' });
    return null;
  }
  const url = new URL(decodeURIComponent(target));
  if (url.protocol !== 'https:') {
    res.status(400).json({ error: 'Only https:// targets are allowed.' });
    return null;
  }
  if (!okHost(url)) {
    res.status(403).json({ error: 'Host not allowed by proxy whitelist.' });
    return null;
  }
  return url;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const url = resolveTarget(req, res);
    if (!url) return;

    const key = CacheKeys.proxy(url.toString());
    const cached = await cacheGet<Record<string, unknown>>(key);
    if (cached) {
      res.setHeader('Cache-Control', `public, s-maxage=${CACHE_TTL_S}`);
      res.status(200).json({ cached: true, data: cached });
      return;
    }

    const upstream = await fetchWithinAllowlist(url);
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
    res.setHeader('Cache-Control', `public, s-maxage=${CACHE_TTL_S}`);
    res.status(200).json({ cached: false, data: out });
  } catch (err) {
    if (err instanceof ProxyBlocked) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    // Don't leak internal error detail to the client (R14); log it server-side.
    console.error('[proxy] request failed:', formatError(err));
    res.status(502).json({ error: 'Proxy request failed.' });
  }
}
