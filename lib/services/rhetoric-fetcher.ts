import * as cheerio from 'cheerio';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { toDateString } from '@/lib/utils/date-utils';

function parseWhiteHouseArticles(
  $: cheerio.CheerioAPI,
  from: Date,
  to: Date,
): { items: ContentItem[]; pastRange: boolean; foundItemsInRange: boolean } {
  const items: ContentItem[] = [];
  let pastRange = false;
  let foundItemsInRange = false;

  $('article, .briefing-statement, .news-item, li').each((_, el) => {
    const $el = $(el);
    const linkEl = $el.find('a').first();
    const href = linkEl.attr('href');
    const title = linkEl.text().trim() || $el.find('h2, h3').first().text().trim();

    const timeEl = $el.find('time').first();
    const dateStr =
      timeEl.attr('datetime') || timeEl.text().trim() || $el.find('.date').first().text().trim();

    if (!title || !href) return;

    const fullUrl = href.startsWith('http')
      ? href
      : `https://www.whitehouse.gov${href.startsWith('/') ? '' : '/'}${href}`;

    const itemDate = dateStr ? new Date(dateStr) : null;
    if (itemDate) {
      if (itemDate < from) {
        pastRange = true;
        return;
      }
      if (itemDate > to) return;
      foundItemsInRange = true;
    }

    items.push({
      title,
      link: fullUrl,
      pubDate: itemDate ? toDateString(itemDate) : undefined,
      agency: 'White House',
      type: 'rhetoric',
    });
  });

  return { items, pastRange, foundItemsInRange };
}

/**
 * Fetch White House briefing-room archive pages for a date range.
 * Scrapes the paginated archive at whitehouse.gov/briefing-room/.
 */
export async function fetchWhiteHouseHistorical(options: {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string; // YYYY-MM-DD
  delayMs?: number;
}): Promise<ContentItem[]> {
  const { dateFrom, dateTo, delayMs = 500 } = options;
  const from = new Date(dateFrom);
  const to = new Date(dateTo);
  const allItems: ContentItem[] = [];
  let page = 1;
  const maxPages = 50; // safety limit

  while (page <= maxPages) {
    const url = `https://www.whitehouse.gov/briefing-room/page/${page}/`;

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DemocracyMonitor/1.0)',
        Accept: 'text/html',
      },
    });

    if (!response.ok) {
      if (response.status === 404) break;
      console.error(`[wh-historical] HTTP ${response.status} for page ${page}`);
      break;
    }

    const html = await response.text();
    const $ = cheerio.load(html);
    const parsed = parseWhiteHouseArticles($, from, to);
    allItems.push(...parsed.items);

    if (parsed.pastRange && !parsed.foundItemsInRange) break;

    page++;
    await sleep(delayMs);
  }

  return allItems;
}

interface GdeltRawArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  sourcecountry?: string;
  tone?: number;
}

function parseGdeltArticles(articles: GdeltRawArticle[], dateFrom: string): ContentItem[] {
  return articles.map((article) => ({
    title: article.title || '(untitled)',
    link: article.url,
    pubDate: article.seendate ? formatGdeltDate(article.seendate) : dateFrom,
    agency: article.domain || 'GDELT',
    summary: article.tone !== undefined ? `Tone: ${article.tone.toFixed(1)}` : undefined,
    type: 'rhetoric',
  }));
}

/**
 * Fetch GDELT data for a date range.
 * Uses the GDELT DOC 2.0 API for full-text article search.
 */
async function fetchGdeltWithRetry(url: string, delayMs: number): Promise<GdeltRawArticle[]> {
  const maxRetries = 3;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    await sleep(delayMs);

    const response = await fetch(url, {
      headers: { 'User-Agent': 'DemocracyMonitor/1.0 (backfill)', Accept: 'application/json' },
    });

    if (response.status === 429) {
      const backoff = 10_000 * 2 ** attempt; // 10s, 20s, 40s
      console.error(
        `[gdelt-historical] HTTP 429 — backing off ${backoff}ms (attempt ${attempt + 1})`,
      );
      await sleep(backoff);
      continue;
    }

    if (!response.ok) {
      console.error(`[gdelt-historical] HTTP ${response.status}`);
      return [];
    }

    const text = await response.text();
    if (!text.startsWith('{')) {
      console.error(`[gdelt-historical] Non-JSON response (attempt ${attempt + 1})`);
      await sleep(10_000);
      continue;
    }

    return (JSON.parse(text).articles as GdeltRawArticle[]) || [];
  }

  console.error('[gdelt-historical] Exhausted retries');
  return [];
}

/**
 * Fetch GDELT data for a date range with retry and rate-limit handling.
 */
export async function fetchGdeltHistorical(options: {
  query: string;
  dateFrom: string;
  dateTo: string;
  maxRecords?: number;
  delayMs?: number;
}): Promise<ContentItem[]> {
  const { query, dateFrom, dateTo, maxRecords = 250, delayMs = 300 } = options;

  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    maxrecords: String(maxRecords),
    format: 'json',
    startdatetime: dateFrom.replace(/-/g, '') + '000000',
    enddatetime: dateTo.replace(/-/g, '') + '235959',
    sort: 'DateDesc',
  });

  try {
    const articles = await fetchGdeltWithRetry(
      `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`,
      delayMs,
    );
    return parseGdeltArticles(articles, dateFrom);
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error('[gdelt-historical] Malformed JSON after retries');
    } else {
      console.error('[gdelt-historical] Fetch error:', err);
    }
    return [];
  }
}

/** GDELT queries relevant to executive power monitoring. Parentheses required for OR expressions. */
export const GDELT_QUERIES = [
  '("executive order" OR "presidential authority" OR "executive power")',
  '("press freedom" OR "journalist arrested" OR "FOIA denied")',
  '("election interference" OR "voter suppression" OR "election administration")',
  '("national emergency" OR "IEEPA" OR "insurrection act")',
  '("inspector general" OR "government oversight" OR "watchdog fired")',
];

function formatGdeltDate(gdeltDate: string): string {
  // GDELT dates are like "20250120T120000Z" or "20250120123000"
  const cleaned = gdeltDate.replace(/[TZ]/g, '');
  if (cleaned.length >= 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }
  return gdeltDate;
}
