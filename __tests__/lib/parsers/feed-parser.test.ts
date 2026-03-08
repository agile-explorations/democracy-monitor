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

  // --- Missing branch coverage tests ---

  it('uses signalType to detect federal_register when payload.type is absent', () => {
    const payload = {
      items: [{ title: 'FR Doc', link: 'https://example.com/fr', pubDate: '2025-01-01' }],
    };
    const result = parseResult(payload, 'federal_register', '/api/federal-register');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('FR Doc');
  });

  it('uses payload.type to detect federal_register when signalType differs', () => {
    const payload = {
      type: 'federal_register',
      items: [{ title: 'FR Doc', link: 'https://example.com/fr' }],
    };
    const result = parseResult(payload, 'some_other_type', '/api/federal-register');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('FR Doc');
  });

  it('falls back to "(document)" when federal_register item has no title', () => {
    const payload = {
      type: 'federal_register',
      items: [{ link: 'https://example.com/doc' }],
    };
    const result = parseResult(payload, 'federal_register', '/api/federal-register');
    expect(result[0].title).toBe('(document)');
  });

  it('uses nested title._ for federal_register items', () => {
    const payload = {
      type: 'federal_register',
      items: [{ title: { _: 'Nested FR Title' }, link: 'https://example.com/doc' }],
    };
    const result = parseResult(payload, 'federal_register', '/api/federal-register');
    expect(result[0].title).toBe('Nested FR Title');
  });

  it('returns undefined link when federal_register link is not a string', () => {
    const payload = {
      type: 'federal_register',
      items: [{ title: 'Test', link: { href: 'https://example.com' } }],
    };
    const result = parseResult(payload, 'federal_register', '/api/federal-register');
    expect(result[0].link).toBeUndefined();
  });

  it('handles federal_register with undefined items', () => {
    const payload = { type: 'federal_register' };
    const result = parseResult(payload, 'federal_register', '/api/federal-register');
    expect(result).toHaveLength(1);
    expect(result[0].isWarning).toBe(true);
  });

  it('uses signalType to detect tracker_scrape when payload.type is absent', () => {
    const payload = {
      items: [{ title: 'Tracker Item', link: 'https://example.com/t', date: '2025-01-01' }],
    };
    const result = parseResult(payload, 'tracker_scrape', '/api/scrape-tracker');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Tracker Item');
  });

  it('uses payload.type to detect tracker_scrape when signalType differs', () => {
    const payload = {
      type: 'tracker_scrape',
      items: [{ title: 'Tracker Item', link: 'https://example.com/t', date: '2025-01-01' }],
    };
    const result = parseResult(payload, 'other', '/api/scrape-tracker');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('Tracker Item');
  });

  it('returns warning with sourceUrl for empty tracker_scrape when sourceUrl exists', () => {
    const payload = { type: 'tracker_scrape', items: [], sourceUrl: 'https://source.example.com' };
    const result = parseResult(payload, 'tracker_scrape', '/api/scrape-tracker');
    expect(result).toHaveLength(1);
    expect(result[0].isWarning).toBe(true);
    expect(result[0].link).toBe('https://source.example.com');
  });

  it('returns warning with baseUrl for empty tracker_scrape when sourceUrl is absent', () => {
    const payload = { type: 'tracker_scrape', items: [] };
    const result = parseResult(payload, 'tracker_scrape', '/api/scrape-tracker');
    expect(result).toHaveLength(1);
    expect(result[0].isWarning).toBe(true);
    expect(result[0].link).toBe('/api/scrape-tracker');
  });

  it('falls back to "(item)" when tracker_scrape item has no title', () => {
    const payload = {
      type: 'tracker_scrape',
      items: [{ link: 'https://example.com/t', date: '2025-01-01' }],
    };
    const result = parseResult(payload, 'tracker_scrape', '/api/scrape-tracker');
    expect(result[0].title).toBe('(item)');
  });

  it('uses nested title._ for tracker_scrape items', () => {
    const payload = {
      type: 'tracker_scrape',
      items: [
        { title: { _: 'Nested Tracker Title' }, link: 'https://example.com/t', date: '2025-01-01' },
      ],
    };
    const result = parseResult(payload, 'tracker_scrape', '/api/scrape-tracker');
    expect(result[0].title).toBe('Nested Tracker Title');
  });

  it('returns undefined link when tracker_scrape link is not a string', () => {
    const payload = {
      type: 'tracker_scrape',
      items: [{ title: 'Test', link: { href: 'https://example.com' }, date: '2025-01-01' }],
    };
    const result = parseResult(payload, 'tracker_scrape', '/api/scrape-tracker');
    expect(result[0].link).toBeUndefined();
  });

  it('handles tracker_scrape with undefined items', () => {
    const payload = { type: 'tracker_scrape' };
    const result = parseResult(payload, 'tracker_scrape', '/api/scrape-tracker');
    expect(result).toHaveLength(1);
    expect(result[0].isWarning).toBe(true);
  });

  it('limits tracker_scrape items to 10', () => {
    const items = Array.from({ length: 20 }, (_, i) => ({
      title: `Item ${i}`,
      link: `https://example.com/${i}`,
      date: '2025-01-01',
    }));
    const payload = { type: 'tracker_scrape', items };
    const result = parseResult(payload, 'tracker_scrape', '/api/scrape-tracker');
    expect(result).toHaveLength(10);
  });

  it('shows "Unknown error" when error payload has no error message', () => {
    const payload = { data: { type: 'error' } };
    const result = parseResult(payload, 'html', 'https://example.com');
    expect(result).toHaveLength(1);
    expect(result[0].isError).toBe(true);
    expect(result[0].title).toBe('Error: Unknown error');
  });

  it('falls back to "(item)" when RSS item has no title at all', () => {
    const payload = {
      data: {
        type: 'rss',
        items: [{ link: 'https://example.com/rss', pubDate: '2025-01-15' }],
      },
    };
    const result = parseResult(payload, 'rss', 'https://example.com/feed');
    expect(result[0].title).toBe('(item)');
  });

  it('uses link._ when link.href is not available in RSS', () => {
    const payload = {
      data: {
        type: 'rss',
        items: [
          {
            title: 'Test',
            link: { _: 'https://example.com/underscore' },
            pubDate: '2025-01-15',
          },
        ],
      },
    };
    const result = parseResult(payload, 'rss', 'https://example.com/feed');
    expect(result[0].link).toBe('https://example.com/underscore');
  });

  it('uses item.id when link is an empty object in RSS', () => {
    const payload = {
      data: {
        type: 'rss',
        items: [
          {
            title: 'Test',
            link: {},
            id: 'https://example.com/id-fallback',
            pubDate: '2025-01-15',
          },
        ],
      },
    };
    const result = parseResult(payload, 'rss', 'https://example.com/feed');
    expect(result[0].link).toBe('https://example.com/id-fallback');
  });

  it('uses published date when pubDate is missing in RSS', () => {
    const payload = {
      data: {
        type: 'rss',
        items: [
          {
            title: 'Test',
            link: 'https://example.com',
            published: '2025-03-01',
          },
        ],
      },
    };
    const result = parseResult(payload, 'rss', 'https://example.com/feed');
    expect(result[0].pubDate).toBe('2025-03-01');
  });

  it('returns undefined summary when RSS item has no description/summary/content', () => {
    const payload = {
      data: {
        type: 'rss',
        items: [{ title: 'No Summary', link: 'https://example.com' }],
      },
    };
    const result = parseResult(payload, 'rss', 'https://example.com/feed');
    expect(result[0].summary).toBeUndefined();
  });

  it('returns undefined summary when federal_register item has no summary', () => {
    const payload = {
      type: 'federal_register',
      items: [{ title: 'Test', link: 'https://example.com' }],
    };
    const result = parseResult(payload, 'federal_register', '/api/federal-register');
    expect(result[0].summary).toBeUndefined();
  });

  it('handles RSS with undefined items', () => {
    const payload = { data: { type: 'rss' } };
    const result = parseResult(payload, 'rss', 'https://example.com/feed');
    expect(result).toHaveLength(0);
  });

  it('falls back to href when anchor text is missing in HTML', () => {
    const payload = {
      data: {
        type: 'html',
        anchors: [{ href: 'https://example.com/page' }],
      },
    };
    const result = parseResult(payload, 'html', 'https://example.com');
    expect(result[0].title).toBe('https://example.com/page');
  });

  it('falls back to "(link)" when anchor has no text or href', () => {
    const payload = {
      data: {
        type: 'html',
        anchors: [{}],
      },
    };
    const result = parseResult(payload, 'html', 'https://example.com');
    expect(result[0].title).toBe('(link)');
  });

  it('handles HTML with undefined anchors', () => {
    const payload = { data: { type: 'html' } };
    const result = parseResult(payload, 'html', 'https://example.com');
    expect(result).toHaveLength(1);
    expect(result[0].isWarning).toBe(true);
  });

  it('falls back to json placeholder when d.json is not an array', () => {
    const payload = { data: { type: 'json', json: 'not-an-array' } };
    const result = parseResult(payload as never, 'json', 'https://example.com/api');
    expect(result).toHaveLength(1);
    expect(result[0].title).toBe('(json data)');
    expect(result[0].link).toBe('https://example.com/api');
  });

  it('handles null payload gracefully', () => {
    const result = parseResult(null as never, 'unknown', 'https://example.com');
    expect(result).toHaveLength(1);
    expect(result[0].isWarning).toBe(true);
  });

  it('uses summary field when description is absent in extractSummary', () => {
    const payload = {
      data: {
        type: 'rss',
        items: [
          {
            title: 'Summary Test',
            link: 'https://example.com',
            summary: 'This is the summary field content.',
          },
        ],
      },
    };
    const result = parseResult(payload, 'rss', 'https://example.com/feed');
    expect(result[0].summary).toBe('This is the summary field content.');
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

  it('strips style blocks with their content', () => {
    expect(stripHtml('<style>.s1 { color: black; }</style><p>Content</p>')).toBe('Content');
  });

  it('strips script blocks with their content', () => {
    expect(stripHtml('<script>alert("x")</script><p>Content</p>')).toBe('Content');
  });

  it('decodes &#039; entity to apostrophe', () => {
    expect(stripHtml('It&#039;s working')).toBe("It's working");
  });

  it('decodes &apos; entity to apostrophe', () => {
    expect(stripHtml('It&apos;s also working')).toBe("It's also working");
  });

  it('decodes &nbsp; to space', () => {
    expect(stripHtml('word1&nbsp;word2')).toBe('word1 word2');
  });
});
