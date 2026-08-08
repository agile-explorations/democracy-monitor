import { describe, expect, it } from 'vitest';
import {
  bucketUrlsByPeriod,
  filterCbpPressUrls,
  filterIcePressUrls,
  normalizeCdxUrl,
  parseCdxResponse,
  parseSitemapLocs,
} from '@/lib/services/dhs-press-archive';

describe('parseSitemapLocs', () => {
  it('extracts loc URLs from sitemap XML', () => {
    const xml = `<?xml version="1.0"?>
<urlset><url><loc>https://www.ice.gov/news/releases/a</loc><lastmod>2022-01-01</lastmod></url>
<url><loc> https://www.ice.gov/about </loc></url></urlset>`;
    expect(parseSitemapLocs(xml)).toEqual([
      'https://www.ice.gov/news/releases/a',
      'https://www.ice.gov/about',
    ]);
  });
});

describe('sitemap URL filters', () => {
  it('keeps only ICE press-release URLs', () => {
    expect(
      filterIcePressUrls([
        'https://www.ice.gov/news/releases/ten-indicted',
        'https://www.ice.gov/news/releases/ten-indicted/sub',
        'https://www.ice.gov/newsroom',
        'https://www.ice.gov/about',
      ]),
    ).toEqual(['https://www.ice.gov/news/releases/ten-indicted']);
  });

  it('keeps only CBP media-release classes, dropping local under national scope', () => {
    const urls = [
      'https://www.cbp.gov/newsroom/national-media-release/watches',
      'https://www.cbp.gov/newsroom/local-media-release/port-roundup',
      'https://www.cbp.gov/newsroom/speeches-and-statements/remarks',
      'https://www.cbp.gov/trade/stats',
    ];
    expect(filterCbpPressUrls(urls, 'national')).toEqual([
      'https://www.cbp.gov/newsroom/national-media-release/watches',
    ]);
    // Unscoped keeps local but never speeches — the live listing walk reads the
    // media-releases view, and baseline scope must match it.
    expect(filterCbpPressUrls(urls)).toEqual([
      'https://www.cbp.gov/newsroom/national-media-release/watches',
      'https://www.cbp.gov/newsroom/local-media-release/port-roundup',
    ]);
  });
});

describe('parseCdxResponse', () => {
  it('parses capture rows and a trailing resume key', () => {
    const text = `https://www.ice.gov/news/releases/a 20220101120000
https://www.ice.gov/news/releases/b 20230601120000

com,ice)/news/releases/c 20230601`;
    const { captures, resumeKey } = parseCdxResponse(text);
    expect(captures).toEqual([
      { url: 'https://www.ice.gov/news/releases/a', timestamp: '20220101120000' },
      { url: 'https://www.ice.gov/news/releases/b', timestamp: '20230601120000' },
    ]);
    expect(resumeKey).toBe('com,ice)/news/releases/c 20230601');
  });

  it('returns null resume key when the response ends after rows', () => {
    const { captures, resumeKey } = parseCdxResponse(
      'https://www.ice.gov/news/releases/a 20220101120000\n',
    );
    expect(captures).toHaveLength(1);
    expect(resumeKey).toBeNull();
  });
});

describe('normalizeCdxUrl', () => {
  it('upgrades scheme and strips tracking queries', () => {
    expect(normalizeCdxUrl('http://www.ice.gov/news/releases/a?utm_source=x')).toBe(
      'https://www.ice.gov/news/releases/a',
    );
  });
});

describe('bucketUrlsByPeriod', () => {
  const captures = new Map([
    ['https://www.ice.gov/news/releases/in-period', '20220315120000'],
    ['https://www.ice.gov/news/releases/late-capture', '20230210120000'],
    ['https://www.ice.gov/news/releases/out-of-period', '20190101120000'],
  ]);

  it('selects URLs first-captured within the range plus buffer', () => {
    const { candidates, unknown } = bucketUrlsByPeriod(
      [
        'https://www.ice.gov/news/releases/in-period',
        'https://www.ice.gov/news/releases/late-capture',
        'https://www.ice.gov/news/releases/out-of-period',
        'https://www.ice.gov/news/releases/no-capture',
      ],
      captures,
      '2022-01-20',
      '2023-01-19',
      60,
    );
    // late-capture (2023-02-10) is inside the 60-day buffer past 2023-01-19.
    expect(candidates).toEqual([
      'https://www.ice.gov/news/releases/in-period',
      'https://www.ice.gov/news/releases/late-capture',
    ]);
    expect(unknown).toEqual(['https://www.ice.gov/news/releases/no-capture']);
  });

  it('excludes buffer overshoot beyond the window', () => {
    const { candidates } = bucketUrlsByPeriod(
      ['https://www.ice.gov/news/releases/late-capture'],
      captures,
      '2022-01-20',
      '2022-06-30',
      60,
    );
    expect(candidates).toEqual([]);
  });
});
