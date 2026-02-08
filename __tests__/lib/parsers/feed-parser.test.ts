import { describe, it, expect } from 'vitest';
import { parseResult, stripHtml } from '@/lib/parsers/feed-parser';

describe('parseResult', () => {
  it('parses federal_register responses', () => {
    const payload = {
      type: 'federal_register',
      items: [
        {
          title: 'Test Rule',
          link: 'https://example.com/rule',
          pubDate: '2025-01-01',
          agency: 'EPA',
        },
      ],
    };
    const result = parseResult(payload, 'federal_register', '/api/federal-register');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Test Rule');
    expect(result[0].link).toBe('https://example.com/rule');
  });

  it('returns warning for empty federal_register', () => {
    const payload = { type: 'federal_register', items: [] };
    const result = parseResult(payload, 'federal_register', '/api/federal-register');
    expect(result).toHaveLength(1);
    expect(result[0].isWarning).toBe(true);
  });

  it('parses tracker_scrape responses', () => {
    const payload = {
      type: 'tracker_scrape',
      items: [{ title: 'Tracking Item 1', link: 'https://example.com/1', date: '2025-01-01' }],
    };
    const result = parseResult(payload, 'tracker_scrape', '/api/scrape-tracker');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Tracking Item 1');
  });

  it('parses rss data wrapped in proxy response', () => {
    const payload = {
      data: {
        type: 'rss',
        items: [{ title: 'RSS Item', link: 'https://example.com/rss', pubDate: '2025-01-15' }],
      },
    };
    const result = parseResult(payload, 'rss', 'https://example.com/feed.xml');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('RSS Item');
    expect(result[0].pubDate).toBe('2025-01-15');
  });

  it('parses html anchors from proxy response', () => {
    const payload = {
      data: {
        type: 'html',
        anchors: [{ text: 'Link Text', href: 'https://example.com/page' }],
      },
    };
    const result = parseResult(payload, 'html', 'https://example.com');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Link Text');
    expect(result[0].link).toBe('https://example.com/page');
  });

  it('returns warning for empty html anchors', () => {
    const payload = { data: { type: 'html', anchors: [] } };
    const result = parseResult(payload, 'html', 'https://example.com');
    expect(result).toHaveLength(1);
    expect(result[0].isWarning).toBe(true);
  });

  it('handles error type', () => {
    const payload = { data: { type: 'error', error: 'Access denied' } };
    const result = parseResult(payload, 'html', 'https://example.com');
    expect(result).toHaveLength(1);
    expect(result[0].isError).toBe(true);
    expect(result[0].title).toContain('Access denied');
  });

  it('handles json type', () => {
    const payload = { data: { type: 'json', json: [{ title: 'JSON Item' }] } };
    const result = parseResult(payload, 'json', 'https://example.com/api');
    expect(result).toHaveLength(1);
  });

  it('returns fallback for unknown payload', () => {
    const payload = {};
    const result = parseResult(payload, 'unknown', 'https://example.com');
    expect(result).toHaveLength(1);
    expect(result[0].isWarning).toBe(true);
    expect(result[0].title).toBe('No data available');
  });

  it('limits federal_register items to 8', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      title: `Rule ${i}`,
      link: `https://example.com/${i}`,
    }));
    const payload = { type: 'federal_register', items };
    const result = parseResult(payload, 'federal_register', '/api/federal-register');
    expect(result).toHaveLength(8);
  });

  it('handles nested title objects in rss', () => {
    const payload = {
      data: {
        type: 'rss',
        items: [
          {
            title: { _: 'Nested Title' },
            link: { href: 'https://example.com' },
            updated: '2025-02-01',
          },
        ],
      },
    };
    const result = parseResult(payload, 'rss', 'https://example.com/feed');
    expect(result[0].title).toBe('Nested Title');
    expect(result[0].link).toBe('https://example.com');
    expect(result[0].pubDate).toBe('2025-02-01');
  });

  it('extracts summary from RSS description field', () => {
    const payload = {
      data: {
        type: 'rss',
        items: [
          {
            title: 'GAO Report',
            link: 'https://example.com/report',
            description: '<p>This report examines <b>federal spending</b> patterns.</p>',
          },
        ],
      },
    };
    const result = parseResult(payload, 'rss', 'https://example.com/feed');
    expect(result[0].summary).toBe('This report examines federal spending patterns.');
  });

  it('extracts summary from RSS content:encoded field', () => {
    const payload = {
      data: {
        type: 'rss',
        items: [
          {
            title: 'Court Ruling',
            link: 'https://example.com/ruling',
            description: 'Short desc',
            'content:encoded':
              '<div><p>The Supreme Court ruled today on executive authority limits.</p></div>',
          },
        ],
      },
    };
    const result = parseResult(payload, 'rss', 'https://example.com/feed');
    // content:encoded takes priority over description
    expect(result[0].summary).toBe('The Supreme Court ruled today on executive authority limits.');
  });

  it('extracts summary from federal_register items', () => {
    const payload = {
      type: 'federal_register',
      items: [
        {
          title: 'Executive Order on Reorganization',
          link: 'https://federalregister.gov/d/2025-001',
          pubDate: '2025-03-01',
          agency: 'Executive Office',
          summary: 'This order directs agencies to submit reorganization plans.',
        },
      ],
    };
    const result = parseResult(payload, 'federal_register', '/api/federal-register');
    expect(result[0].summary).toBe('This order directs agencies to submit reorganization plans.');
  });

  it('truncates long summaries to 800 characters', () => {
    const longText = 'A'.repeat(1000);
    const payload = {
      data: {
        type: 'rss',
        items: [{ title: 'Long Item', link: 'https://example.com', description: longText }],
      },
    };
    const result = parseResult(payload, 'rss', 'https://example.com/feed');
    expect(result[0].summary!.length).toBe(801); // 800 chars + ellipsis
    expect(result[0].summary!.endsWith('…')).toBe(true);
  });

  it('handles nested description objects', () => {
    const payload = {
      data: {
        type: 'rss',
        items: [
          {
            title: 'Nested Desc',
            link: 'https://example.com',
            description: { _: '<p>Nested content</p>' },
          },
        ],
      },
    };
    const result = parseResult(payload, 'rss', 'https://example.com/feed');
    expect(result[0].summary).toBe('Nested content');
  });
});

describe('stripHtml', () => {
  it('removes HTML tags', () => {
    expect(stripHtml('<p>Hello <b>world</b></p>')).toBe('Hello world');
  });

  it('decodes HTML entities', () => {
    expect(stripHtml('A &amp; B &lt; C &gt; D &quot;E&quot;')).toBe('A & B < C > D "E"');
  });

  it('collapses whitespace', () => {
    expect(stripHtml('  hello   world  ')).toBe('hello world');
  });

  it('handles empty string', () => {
    expect(stripHtml('')).toBe('');
  });
});
