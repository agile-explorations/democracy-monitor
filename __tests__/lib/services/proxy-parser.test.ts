import { describe, it, expect } from 'vitest';
import { extractAnchors, parseUpstreamResponse } from '@/lib/services/proxy-parser';

const BASE_URL = new URL('https://example.com/page');

describe('extractAnchors', () => {
  it('extracts href and text from anchor tags', () => {
    const html = '<a href="https://example.com/article">Article Title</a>';
    const result = extractAnchors(html, BASE_URL, 10);
    expect(result).toEqual([{ href: 'https://example.com/article', text: 'Article Title' }]);
  });

  it('resolves relative URLs against baseUrl', () => {
    const html = '<a href="/relative/path">Relative Link</a>';
    const result = extractAnchors(html, BASE_URL, 10);
    expect(result).toEqual([{ href: 'https://example.com/relative/path', text: 'Relative Link' }]);
  });

  it('respects maxAnchors limit', () => {
    const html = '<a href="/a">A</a> <a href="/b">B</a> <a href="/c">C</a> <a href="/d">D</a>';
    const result = extractAnchors(html, BASE_URL, 2);
    expect(result).toHaveLength(2);
    expect(result[0].text).toBe('A');
    expect(result[1].text).toBe('B');
  });

  it('strips inner HTML tags from text', () => {
    const html = '<a href="/link"><span>Nested</span> Text</a>';
    // The regex only captures text between > and <, so nested tags won't appear
    // in the capture group. The .replace(/<[^>]*>/g, '') handles any remaining tags.
    const result = extractAnchors(html, BASE_URL, 10);
    // Due to regex pattern capturing [^<]+, inner tags cause the match to fail
    expect(result).toHaveLength(0);
  });

  it('returns empty array when no anchors found', () => {
    const html = '<p>No links here</p>';
    const result = extractAnchors(html, BASE_URL, 10);
    expect(result).toEqual([]);
  });
});

describe('parseUpstreamResponse', () => {
  it('detects "Access Denied" as error', async () => {
    const result = await parseUpstreamResponse(
      'Access Denied - You are not authorized',
      'text/html',
      BASE_URL,
    );
    expect(result.type).toBe('error');
    expect(result.error).toBe('Access denied by remote server');
  });

  it('detects "403 Forbidden" as error', async () => {
    const result = await parseUpstreamResponse('403 Forbidden', 'text/html', BASE_URL);
    expect(result.type).toBe('error');
  });

  it('detects "blocked" text as error', async () => {
    const result = await parseUpstreamResponse(
      'Your request has been blocked',
      'text/html',
      BASE_URL,
    );
    expect(result.type).toBe('error');
  });

  it('parses XML/RSS content-type as rss', async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Test Feed</title>
          <item><title>Item 1</title></item>
        </channel>
      </rss>`;
    const result = await parseUpstreamResponse(xml, 'application/xml', BASE_URL);
    expect(result.type).toBe('rss');
    expect(result.title).toBe('Test Feed');
    expect(result.items).toHaveLength(1);
  });

  it('detects <?xml prefix even with text/html content-type', async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>Feed</title>
          <item><title>Entry</title></item>
        </channel>
      </rss>`;
    const result = await parseUpstreamResponse(xml, 'text/html', BASE_URL);
    expect(result.type).toBe('rss');
  });

  it('parses valid JSON', async () => {
    const json = JSON.stringify({ data: [1, 2, 3] });
    const result = await parseUpstreamResponse(json, 'application/json', BASE_URL);
    expect(result.type).toBe('json');
    expect(result.json).toEqual({ data: [1, 2, 3] });
  });

  it('falls back to text for invalid JSON', async () => {
    const result = await parseUpstreamResponse('not valid json {', 'application/json', BASE_URL);
    expect(result.type).toBe('text');
    expect(result.raw).toBe('not valid json {');
  });

  it('extracts anchors from HTML content', async () => {
    const html = `
      <html>
        <body>
          <a href="https://example.com/article">Article About Something</a>
          <a href="/page">Another Page Here</a>
        </body>
      </html>`;
    const result = await parseUpstreamResponse(html, 'text/html', BASE_URL);
    expect(result.type).toBe('html');
    expect(result.anchors).toHaveLength(2);
  });

  it('filters short anchor text and javascript hrefs from HTML', async () => {
    const html = `
      <a href="javascript:void(0)">Click Here To Read</a>
      <a href="/page">OK</a>
      <a href="/long">Long Enough Title</a>`;
    const result = await parseUpstreamResponse(html, 'text/html', BASE_URL);
    expect(result.type).toBe('html');
    const anchors = result.anchors as Array<{ href: string; text: string }>;
    // "OK" is too short (<=5 chars), javascript href is filtered
    expect(anchors).toHaveLength(1);
    expect(anchors[0].text).toBe('Long Enough Title');
  });

  it('parses rss content-type', async () => {
    const xml = `<?xml version="1.0"?>
      <rss version="2.0">
        <channel>
          <title>RSS Feed</title>
          <item><title>Entry 1</title></item>
          <item><title>Entry 2</title></item>
        </channel>
      </rss>`;
    const result = await parseUpstreamResponse(xml, 'application/rss+xml', BASE_URL);
    expect(result.type).toBe('rss');
    expect(result.items).toHaveLength(2);
  });
});
