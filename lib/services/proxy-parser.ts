import { parseStringPromise } from 'xml2js';

const ANCHOR_RE = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/gi;

export const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.5',
  'Accept-Encoding': 'gzip, deflate',
  DNT: '1',
  Connection: 'keep-alive',
  'Upgrade-Insecure-Requests': '1',
};

export function extractAnchors(
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

export async function parseUpstreamResponse(
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
    } catch (err) {
      console.warn('[proxy-parser] Invalid JSON from', baseUrl.hostname, err);
      return { type: 'text', raw: text.slice(0, 2000) };
    }
  }
  const anchors = extractAnchors(text, baseUrl, 20).filter(
    (item) => item.text.length > 5 && !item.href.includes('javascript:'),
  );
  return { type: 'html', anchors };
}
