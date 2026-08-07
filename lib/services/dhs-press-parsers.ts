import * as cheerio from 'cheerio';

/**
 * Pure HTML parsers for the DHS/ICE/CBP newsroom source (#605). All three
 * newsrooms are Drupal but render different listing markup; each host gets its
 * own listing parser. Article pages share a body-node convention
 * (.field--name-body) but differ in where the release date lives.
 *
 * Fixture-verified against live captures 2026-08-07. Known markup hazards:
 * - CBP listing <time datetime> is a static template placeholder (the same
 *   2020-09-30 value on every row) — the real date is in the visible spans.
 * - ICE article pages embed related-news teasers that also carry
 *   .field--name-body; the main body is selected by largest text, not first.
 */

export type PressHost = 'dhs' | 'ice' | 'cbp';

export interface PressListingItem {
  title: string;
  url: string;
  /** ISO date (YYYY-MM-DD) when the listing exposes one; null → detail page decides. */
  publishedAt: string | null;
  host: PressHost;
  /** ICE topic tag (e.g. "Enforcement and Removal", "Homeland Security Investigations"). */
  topicTag?: string;
  /** Listing teaser text, when present. */
  teaser?: string;
  /** CBP release class from the URL path (national-media-release | local-media-release | ...). */
  urlClass?: string;
  /** Full body text, populated by the article-page enrichment pass. */
  body?: string;
  /** ICE dateline locality, populated by the article-page enrichment pass. */
  locality?: string;
}

export interface PressArticle {
  title: string | null;
  publishedAt: string | null;
  body: string;
  /** ICE dateline locality (e.g. "Galveston"), when present. */
  locality?: string;
}

export const PRESS_HOST_BASE_URLS: Record<PressHost, string> = {
  dhs: 'https://www.dhs.gov',
  ice: 'https://www.ice.gov',
  cbp: 'https://www.cbp.gov',
};

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/** Parse "August 7, 2026" / "Aug 7, 2026" into YYYY-MM-DD (null when unparseable). */
export function parseMonthNameDate(text: string): string | null {
  const m = text.trim().match(/^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/);
  if (!m) return null;
  const month = MONTHS[m[1].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${m[3]}-${month}-${m[2].padStart(2, '0')}`;
}

/** Parse "Fri, 08/07/2026" / "08/07/2026" into YYYY-MM-DD (null when unparseable). */
export function parseSlashDate(text: string): string | null {
  const m = text.trim().match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}

/** Extract YYYY-MM-DD from a DHS /news/YYYY/MM/DD/slug or /archive/news/... path. */
export function dateFromDhsNewsUrl(url: string): string | null {
  const m = url.match(/\/(?:archive\/)?news\/(\d{4})\/(\d{2})\/(\d{2})\//);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/** CBP release class from the URL path; null for non-newsroom-release URLs. */
export function cbpUrlClass(url: string): string | null {
  const m = url.match(/\/newsroom\/([a-z-]*media-release|speeches-and-statements)\//);
  return m ? m[1] : null;
}

/** True for CBP port-level local media releases (excluded from ingest — owner decision 2026-08-07). */
export function isLocalMediaRelease(url: string): boolean {
  return cbpUrlClass(url) === 'local-media-release';
}

function absoluteUrl(href: string, host: PressHost): string {
  return href.startsWith('http') ? href : `${PRESS_HOST_BASE_URLS[host]}${href}`;
}

/**
 * DHS press listing (/news-releases/press-releases and /archive/news): USWDS
 * collection items whose link carries the date in both the URL path and a
 * <time datetime> element.
 */
export function parseDhsListingPage(html: string): PressListingItem[] {
  const $ = cheerio.load(html);
  const items: PressListingItem[] = [];
  $('ul.usa-collection li.usa-collection__item').each((_i, el) => {
    const $item = $(el);
    const link = $item.find('a[href*="/news/"]').first();
    const href = link.attr('href');
    if (!href) return;
    const title =
      link.attr('title')?.trim() || $item.find('.usa-collection__heading').text().trim();
    if (!title) return;
    const datetime = $item.find('time').attr('datetime')?.slice(0, 10) ?? null;
    items.push({
      title,
      url: absoluteUrl(href, 'dhs'),
      publishedAt: datetime ?? dateFromDhsNewsUrl(href),
      host: 'dhs',
    });
  });
  return items;
}

/** ICE newsroom listing (/newsroom): teaser cards with a human-format date and topic tag. */
export function parseIceListingPage(html: string): PressListingItem[] {
  const $ = cheerio.load(html);
  const items: PressListingItem[] = [];
  $('.views-row').each((_i, el) => {
    const $row = $(el);
    const link = $row.find('.news-title a').first();
    const href = link.attr('href');
    const title = link.text().trim();
    if (!href || !title) return;
    const topicTag = $row
      .find('.news-tag')
      .text()
      .replace(/^\s*\|\s*/, '')
      .trim();
    items.push({
      title,
      url: absoluteUrl(href, 'ice'),
      publishedAt: parseMonthNameDate($row.find('.news-date').text()),
      host: 'ice',
      topicTag: topicTag || undefined,
      teaser: $row.find('.news-body').text().trim() || undefined,
    });
  });
  return items;
}

/**
 * CBP media-releases listing (/newsroom/media-releases/all): USWDS collection
 * items. The <time datetime> attribute is a static template placeholder — the
 * real date is the visible span text ("Aug 07" month span + "2026" day span,
 * the classes are mislabeled upstream).
 */
export function parseCbpListingPage(html: string): PressListingItem[] {
  const $ = cheerio.load(html);
  const items: PressListingItem[] = [];
  $('li.usa-collection__item').each((_i, el) => {
    const $item = $(el);
    const link = $item.find('.usa-collection__heading a').first();
    const href = link.attr('href');
    const title = link.text().trim();
    if (!href || !title) return;
    const monthDay = $item.find('.usa-collection__calendar-date-month').text().trim();
    const year = $item.find('.usa-collection__calendar-date-day').text().trim();
    items.push({
      title,
      url: absoluteUrl(href, 'cbp'),
      publishedAt: parseMonthNameDate(`${monthDay}, ${year}`),
      host: 'cbp',
      urlClass: cbpUrlClass(href) ?? undefined,
      teaser: $item.find('.views-pages-body-padding').text().trim() || undefined,
    });
  });
  return items;
}

export const LISTING_PARSERS: Record<PressHost, (html: string) => PressListingItem[]> = {
  dhs: parseDhsListingPage,
  ice: parseIceListingPage,
  cbp: parseCbpListingPage,
};

/**
 * Main article body text. ICE renders the release in .nr-body; DHS/CBP use the
 * Drupal .field--name-body convention, where the largest-text node is selected
 * because ICE-style pages also attach mission blurbs and related-news teasers
 * under the same class.
 */
function mainBodyText($: cheerio.CheerioAPI, host: PressHost): string {
  if (host === 'ice') {
    const nrBody = $('.nr-body').first().text().replace(/\s+/g, ' ').trim();
    if (nrBody) return nrBody;
  }
  let best = '';
  $('.field--name-body').each((_i, el) => {
    const text = $(el).text().replace(/\s+/g, ' ').trim();
    if (text.length > best.length) best = text;
  });
  return best;
}

function articleDate($: cheerio.CheerioAPI, host: PressHost, url: string): string | null {
  if (host === 'ice') {
    const og = $('meta[property="article:published_time"]').attr('content');
    if (og) return og.slice(0, 10);
    return parseMonthNameDate($('.nr-meta').first().contents().first().text());
  }
  if (host === 'dhs') {
    return (
      parseMonthNameDate($('.news-release-date-value').first().text()) ?? dateFromDhsNewsUrl(url)
    );
  }
  const labeled = $('.field__label:contains("Release Date")')
    .first()
    .siblings('.field__item')
    .first()
    .text();
  return parseSlashDate(labeled);
}

/**
 * Parse a press-release article page: title (h1), authoritative release date
 * (per-host location), and the full body text from the main Drupal body node.
 */
export function parseArticlePage(html: string, host: PressHost, url: string): PressArticle {
  const $ = cheerio.load(html);
  const title = $('h1').first().text().replace(/\s+/g, ' ').trim() || null;
  const locality = $('.nr-meta .locality').first().text().trim();
  return {
    title,
    publishedAt: articleDate($, host, url),
    body: mainBodyText($, host),
    locality: locality || undefined,
  };
}
