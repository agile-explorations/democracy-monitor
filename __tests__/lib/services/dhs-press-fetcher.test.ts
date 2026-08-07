import { describe, expect, it } from 'vitest';
import {
  dedupeCrossHost,
  isHsiCriminalItem,
  normalizePressTitle,
  parseDhsPressParams,
  toContentItem,
} from '@/lib/services/dhs-press-fetcher';
import {
  cbpUrlClass,
  dateFromDhsNewsUrl,
  isLocalMediaRelease,
  parseArticlePage,
  parseCbpListingPage,
  parseDhsListingPage,
  parseIceListingPage,
  parseMonthNameDate,
  parseSlashDate,
} from '@/lib/services/dhs-press-parsers';
import type { PressListingItem } from '@/lib/services/dhs-press-parsers';

// Fixtures mirror live markup captured 2026-08-07.

// DHS /news-releases/press-releases + /archive/news: USWDS collection items.
const DHS_LISTING_HTML = `
<div class="view-content ">
<ul class="usa-collection">
<li class="usa-collection__item">
  <a href="/news/2026/08/07/secretary-tours-facility" title="Secretary Tours Facility" alt="Aug 7 2026">
    <span class="field-content">
      <div class="usa-collection__calendar-date"><time datetime="2026-08-07"><span>Aug 7</span></time></div>
      <h3 class="usa-collection__heading">Secretary Tours Facility</h3>
    </span>
  </a>
</li>
<li class="usa-collection__item">
  <a href="/archive/news/2025/01/16/face-recognition-update" title="Face Recognition Update" alt="Jan 16 2025">
    <span class="field-content">
      <div class="usa-collection__calendar-date"><time datetime="2025-01-16"><span>Jan 16</span></time></div>
      <h3 class="usa-collection__heading">Face Recognition Update</h3>
    </span>
  </a>
</li>
</ul>
</div>`;

// ICE /newsroom: teaser cards with human-format date and topic tag.
const ICE_LISTING_HTML = `
<div class="views-row"><div class="views-field views-field-nothing"><span class="field-content"><div class="news-wrapper">
<div class="news-content">
<div class="news-title"><a href="/news/releases/ice-operation-nets-arrests" hreflang="en">ICE operation nets arrests  </a></div>
<div class="news-tags">
<div class="news-date">August 7, 2026</div>
<div class="news-tag"><span class="news-dash">|</span>Enforcement and Removal</div>
</div>
<div class="news-body">The immigration enforcement operation netted offenders. </div>
</div>
</div></span></div></div>
<div class="views-row"><div class="views-field views-field-nothing"><span class="field-content"><div class="news-wrapper">
<div class="news-content">
<div class="news-title"><a href="/news/releases/hsi-fraud-scheme" hreflang="en">ICE HSI uncovers visa fraud scheme</a></div>
<div class="news-tags">
<div class="news-date">August 6, 2026</div>
<div class="news-tag"><span class="news-dash">|</span>Homeland Security Investigations</div>
</div>
<div class="news-body">Defendants were charged with conspiracy to commit fraud. </div>
</div>
</div></span></div></div>`;

// CBP /newsroom/media-releases/all: the <time datetime> is a static template
// placeholder (same value on every row) — real date is the visible span text.
const CBP_LISTING_HTML = `
<div class="view-content">
<ul class="usa-collection">
<li class="usa-collection__item  newsroom-latest-width">
<div class="usa-collection__calendar-date">
<time datetime="2020-09-30T12:00:00+01:00">
<span class="usa-collection__calendar-date-month">Aug 07</span>
<span class="usa-collection__calendar-date-day">2026</span></time>
</div>
<div class="usa-collection__body">
<div class="usa-collection__heading sizeH3-adj">
<a href="/newsroom/national-media-release/counterfeit-watches-intercepted" hreflang="en">$43 million in counterfeit watches intercepted </a> | National Media Release
</div>
<div class="views-pages-body-padding">LOUISVILLE, Ky. —Officers intercepted a shipment…</div>
</div>
</li>
<li class="usa-collection__item  newsroom-latest-width">
<div class="usa-collection__calendar-date">
<time datetime="2020-09-30T12:00:00+01:00">
<span class="usa-collection__calendar-date-month">Aug 06</span>
<span class="usa-collection__calendar-date-day">2026</span></time>
</div>
<div class="usa-collection__body">
<div class="usa-collection__heading sizeH3-adj">
<a href="/newsroom/local-media-release/port-seizure-roundup" hreflang="en">Port seizure roundup </a> | Local Media Release
</div>
</div>
</li>
</ul>
</div>`;

// DHS article: release date in a labeled block; body is the article's Drupal body node.
const DHS_ARTICLE_HTML = `
<h1>ICE Takes Down Predators</h1>
<div class="news-release-date-block"><span class="news-release-date-label"><strong>Release Date: </strong></span> <span class="news-release-date-value">July 14, 2025</span></div>
<article lang="en"><div>
<div class="field field--name-body field--type-text-with-summary field--label-hidden field__item"><p>Under the current administration, ICE is working to remove offenders from communities across the country every single day.</p></div>
</div></article>`;

// ICE article: og meta date; the real body is .nr-body — the page also carries
// a standing mission blurb under .field--name-body that must NOT be selected.
const ICE_ARTICLE_HTML = `
<meta property="article:published_time" content="2022-08-26" />
<div class="nr-head"><div class="nr-meta">August 26, 2022<i></i><span class="locality">Galveston</span><span class="TX">, TX</span></div>
<div class="nr-title"><h1>10 MS-13 gang members indicted</h1></div></div>
<div class="nr-content-area"><div class="nr-body"><p>GALVESTON, Texas – Ten alleged MS-13 gang members were indicted Aug. 24 by a federal grand jury for various crimes including racketeering conspiracy and murder.</p></div></div>
<div class="field field--name-body field--type-text-with-summary field--label-hidden field__item">Securing the Homeland Combating cross-border criminal activity is a critical component of the overall safety.</div>`;

// CBP article: release date in an inline labeled field ("Fri, 08/07/2026").
const CBP_ARTICLE_HTML = `
<h1><span class="field field--name-title">$43 million in counterfeit watches intercepted</span></h1>
<div class="field--label-inline clearfix"><div class="field__label">Release Date</div><div class="field__item">Fri, 08/07/2026</div></div>
<div class="field field--name-body field--type-text-with-summary field--label-hidden field__item"><p>LOUISVILLE, Ky. —On July 31, U.S. Customs and Border Protection officers intercepted yet another shipment of counterfeit watches with a combined value in the millions.</p></div>`;

describe('date helpers', () => {
  it('parses month-name dates', () => {
    expect(parseMonthNameDate('August 7, 2026')).toBe('2026-08-07');
    expect(parseMonthNameDate('Aug 07, 2026')).toBe('2026-08-07');
    expect(parseMonthNameDate('not a date')).toBeNull();
  });

  it('parses slash dates with weekday prefixes', () => {
    expect(parseSlashDate('Fri, 08/07/2026')).toBe('2026-08-07');
    expect(parseSlashDate('nope')).toBeNull();
  });

  it('extracts dates from DHS news and archive URL paths', () => {
    expect(dateFromDhsNewsUrl('/news/2026/08/07/slug')).toBe('2026-08-07');
    expect(dateFromDhsNewsUrl('/archive/news/2025/01/16/slug')).toBe('2025-01-16');
    expect(dateFromDhsNewsUrl('/newsroom/foo')).toBeNull();
  });
});

describe('CBP URL classes', () => {
  it('classifies release URL classes and flags local media releases', () => {
    expect(cbpUrlClass('https://www.cbp.gov/newsroom/national-media-release/x')).toBe(
      'national-media-release',
    );
    expect(isLocalMediaRelease('https://www.cbp.gov/newsroom/local-media-release/x')).toBe(true);
    expect(isLocalMediaRelease('https://www.cbp.gov/newsroom/national-media-release/x')).toBe(
      false,
    );
  });
});

describe('listing parsers', () => {
  it('parses DHS collection items with URL-path and datetime dates', () => {
    const items = parseDhsListingPage(DHS_LISTING_HTML);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'Secretary Tours Facility',
      url: 'https://www.dhs.gov/news/2026/08/07/secretary-tours-facility',
      publishedAt: '2026-08-07',
      host: 'dhs',
    });
    expect(items[1].publishedAt).toBe('2025-01-16');
  });

  it('parses ICE teaser cards with human dates, tags, and teasers', () => {
    const items = parseIceListingPage(ICE_LISTING_HTML);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: 'ICE operation nets arrests',
      url: 'https://www.ice.gov/news/releases/ice-operation-nets-arrests',
      publishedAt: '2026-08-07',
      topicTag: 'Enforcement and Removal',
    });
    expect(items[1].topicTag).toBe('Homeland Security Investigations');
  });

  it('parses CBP items from span text, ignoring the placeholder datetime', () => {
    const items = parseCbpListingPage(CBP_LISTING_HTML);
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      publishedAt: '2026-08-07',
      urlClass: 'national-media-release',
    });
    expect(items[0].publishedAt).not.toBe('2020-09-30');
    expect(items[1].urlClass).toBe('local-media-release');
  });
});

describe('parseArticlePage', () => {
  it('parses DHS articles: labeled release date and body node', () => {
    const article = parseArticlePage(
      DHS_ARTICLE_HTML,
      'dhs',
      'https://www.dhs.gov/news/2025/07/14/x',
    );
    expect(article.title).toBe('ICE Takes Down Predators');
    expect(article.publishedAt).toBe('2025-07-14');
    expect(article.body).toContain('working to remove offenders');
  });

  it('parses ICE articles: og date, locality, and .nr-body over the mission blurb', () => {
    const article = parseArticlePage(
      ICE_ARTICLE_HTML,
      'ice',
      'https://www.ice.gov/news/releases/x',
    );
    expect(article.publishedAt).toBe('2022-08-26');
    expect(article.locality).toBe('Galveston');
    expect(article.body).toContain('GALVESTON, Texas');
    expect(article.body).not.toContain('Securing the Homeland');
  });

  it('parses CBP articles: inline labeled slash date', () => {
    const article = parseArticlePage(
      CBP_ARTICLE_HTML,
      'cbp',
      'https://www.cbp.gov/newsroom/national-media-release/x',
    );
    expect(article.publishedAt).toBe('2026-08-07');
    expect(article.body).toContain('LOUISVILLE');
  });

  it('falls back to the DHS URL-path date when the labeled block is absent', () => {
    const article = parseArticlePage(
      '<h1>T</h1>',
      'dhs',
      'https://www.dhs.gov/archive/news/2024/03/05/x',
    );
    expect(article.publishedAt).toBe('2024-03-05');
  });
});

describe('parseDhsPressParams', () => {
  it('parses hosts and optional params', () => {
    expect(parseDhsPressParams('dhspress://dhs')).toEqual({ host: 'dhs' });
    expect(parseDhsPressParams('dhspress://cbp?scope=national')).toEqual({
      host: 'cbp',
      scope: 'national',
    });
    expect(parseDhsPressParams('dhspress://ice?filter=hsi-criminal')).toEqual({
      host: 'ice',
      filter: 'hsi-criminal',
    });
  });

  it('throws on unknown hosts', () => {
    expect(() => parseDhsPressParams('dhspress://tsa')).toThrow(/Unknown host/);
    expect(() => parseDhsPressParams('oig://dhs')).toThrow(/Unknown host/);
  });
});

describe('isHsiCriminalItem', () => {
  it('requires both HSI attribution and criminal-justice vocabulary', () => {
    expect(
      isHsiCriminalItem({
        title: 'ICE HSI uncovers visa fraud scheme',
        topicTag: 'Homeland Security Investigations',
      }),
    ).toBe(true);
    // ERO removal roundup: criminal vocabulary without HSI attribution.
    expect(
      isHsiCriminalItem({
        title: 'ICE arrests criminal aliens charged with reentry',
        topicTag: 'Enforcement and Removal',
      }),
    ).toBe(false);
    // HSI attribution without criminal vocabulary (administrative/rhetoric).
    expect(
      isHsiCriminalItem({ title: 'HSI celebrates agency anniversary', topicTag: undefined }),
    ).toBe(false);
  });

  it('matches HSI case-sensitively in text', () => {
    expect(isHsiCriminalItem({ title: 'His indictment was announced' })).toBe(false);
  });
});

const listingItem = (over: Partial<PressListingItem>): PressListingItem => ({
  title: 'A release',
  url: 'https://www.ice.gov/news/releases/a-release',
  publishedAt: '2026-08-07',
  host: 'ice',
  ...over,
});

describe('dedupeCrossHost', () => {
  it('drops HQ mirrors, preferring the component agency original', () => {
    const ice = listingItem({ title: 'ICE nets arrests in Georgia' });
    const dhsMirror = listingItem({
      title: 'ICE Nets Arrests in Georgia!',
      host: 'dhs',
      url: 'https://www.dhs.gov/news/2026/08/07/ice-nets-arrests',
    });
    const merged = dedupeCrossHost([dhsMirror, ice]);
    expect(merged).toHaveLength(1);
    expect(merged[0].host).toBe('ice');
  });

  it('keeps same-title releases on different days', () => {
    const a = listingItem({});
    const b = listingItem({ publishedAt: '2026-08-06', host: 'dhs' });
    expect(dedupeCrossHost([a, b])).toHaveLength(2);
  });

  it('normalizes punctuation and case in titles', () => {
    expect(normalizePressTitle('ICE Nets — Arrests, in Georgia!')).toBe(
      'ice nets arrests in georgia',
    );
  });
});

describe('toContentItem', () => {
  it('sets sourceOrigin explicitly (inferSourceOrigin would mislabel press_release as doj)', () => {
    const item = toContentItem(listingItem({ body: 'x'.repeat(200) }));
    expect(item.sourceOrigin).toBe('dhs_press');
    expect(item.type).toBe('press_release');
    expect(item.contentType).toBeUndefined();
    expect(item.agency).toBe('U.S. Immigration and Customs Enforcement');
  });

  it('marks short-body releases metadata_only', () => {
    const item = toContentItem(listingItem({ body: 'too short' }));
    expect(item.contentType).toBe('metadata_only');
  });

  it('carries host, tag, class, and locality metadata', () => {
    const item = toContentItem(
      listingItem({
        topicTag: 'Homeland Security Investigations',
        urlClass: 'national-media-release',
        locality: 'Galveston',
        host: 'cbp',
      }),
    );
    expect(item.metadata).toMatchObject({
      host: 'cbp',
      topicTag: 'Homeland Security Investigations',
      urlClass: 'national-media-release',
      locality: 'Galveston',
    });
  });
});
