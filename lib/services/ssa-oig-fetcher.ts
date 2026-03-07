import * as cheerio from 'cheerio';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const BASE_URL = 'https://oig.ssa.gov';
const REPORTS_PATH = '/audit-reports/';
const FETCH_TIMEOUT_MS = 30_000;
const POLITENESS_DELAY_MS = 2_000;
const MAX_PAGES = 50;

export interface SsaOigReport {
  title: string;
  url: string;
  publishedAt: string; // ISO date
  reportNumber: string;
}

/**
 * Parse an SSA OIG signal URL.
 * Format: oig://ssa
 */
export function parseSsaOigParams(_signalUrl: string): Record<string, never> {
  return {};
}

/** Convert a parsed SSA OIG report to a ContentItem. */
export function toContentItem(report: SsaOigReport): ContentItem {
  return {
    title: report.title,
    link: report.url,
    pubDate: report.publishedAt,
    agency: 'SSA Office of the Inspector General',
    summary: `Report ${report.reportNumber}`,
    type: 'ig_report',
    sourceOrigin: 'oig',
  };
}

const MONTH_MAP: Record<string, string> = {
  January: '01',
  February: '02',
  March: '03',
  April: '04',
  May: '05',
  June: '06',
  July: '07',
  August: '08',
  September: '09',
  October: '10',
  November: '11',
  December: '12',
};

/** Parse "March 05, 2026" format to ISO date string. */
export function parseSsaDate(dateStr: string): string | null {
  const match = dateStr.trim().match(/^(\w+)\s+(\d{2}),\s+(\d{4})$/);
  if (!match) return null;
  const month = MONTH_MAP[match[1]];
  if (!month) return null;
  return `${match[3]}-${month}-${match[2]}T12:00:00Z`;
}

/**
 * Parse SSA OIG report entries from the page HTML.
 *
 * Two page layouts exist:
 * 1. Main page (/audit-reports/): dates are standalone divs between report blocks
 * 2. Year pages (/audit-reports/YYYY/): dates are inside each report block
 *    in a div.display-flex with an SVG icon prefix
 *
 * Both share: div.padding-bottom-5 blocks with h3 > a.usa-link for title/URL
 * and div.text-italic for report number.
 */
export function parseReportsFromHtml(html: string): SsaOigReport[] {
  const $ = cheerio.load(html);
  const reports: SsaOigReport[] = [];

  const contentArea = $('div.desktop\\:grid-col-8');
  if (contentArea.length === 0) return reports;

  let currentDate = '';

  contentArea.children().each((_i, el) => {
    const $el = $(el);
    const text = $el.text().trim();

    // Check if this is a standalone date element (main page layout)
    const dateMatch = text.match(/^(\w+\s+\d{2},\s+\d{4})$/);
    if (dateMatch) {
      currentDate = dateMatch[1];
      return;
    }

    // Check if this is a report block
    const linkEl = $el.find('a.usa-link.text-no-underline');
    if (linkEl.length === 0) return;

    const title = linkEl.text().trim();
    const href = linkEl.attr('href');
    if (!title || !href) return;

    const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

    // Extract report number
    const numberDiv = $el.find('.text-italic');
    const numberMatch = numberDiv.text().match(/Number:\s*(\S+)/);
    const reportNumber = numberMatch?.[1] || '';

    // Year page layout: date is inside the report block (div.display-flex with SVG icon)
    const inlineDateEl = $el.find('div.display-flex.flex-align-center');
    if (inlineDateEl.length > 0) {
      const inlineText = inlineDateEl.text().trim();
      const inlineMatch = inlineText.match(/(\w+\s+\d{2},\s+\d{4})/);
      if (inlineMatch) currentDate = inlineMatch[1];
    }

    const publishedAt = parseSsaDate(currentDate);
    if (!publishedAt) return;

    reports.push({ title, url, publishedAt, reportNumber });
  });

  return reports;
}

/** Fetch a single page of SSA OIG reports. */
async function fetchPage(
  pageUrl: string,
): Promise<{ reports: SsaOigReport[]; totalPages: number }> {
  const response = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'DemocracyMonitor/1.0 (civic monitoring)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`[ssa-oig] HTTP ${response.status} for ${pageUrl}`);
  }

  const html = await response.text();
  const reports = parseReportsFromHtml(html);

  // Extract total pages from pagination
  const $ = cheerio.load(html);
  let totalPages = 1;
  const lastPageLink = $('a.usa-pagination__button').last().attr('href');
  if (lastPageLink) {
    const pageMatch = lastPageLink.match(/page\/(\d+)/);
    if (pageMatch) totalPages = parseInt(pageMatch[1], 10);
  }

  return { reports, totalPages };
}

/** Fetch recent SSA OIG reports for the snapshot pipeline. */
export async function fetchSsaOigRecent(_params: Record<string, never>): Promise<ContentItem[]> {
  const { reports } = await fetchPage(`${BASE_URL}${REPORTS_PATH}`);
  return reports.slice(0, 20).map(toContentItem);
}

/**
 * Get the calendar years that overlap with a date range.
 * E.g., 2017-01-20 to 2018-01-19 → [2017, 2018]
 */
function getOverlappingYears(dateFrom: string, dateTo: string): number[] {
  const startYear = new Date(dateFrom).getFullYear();
  const endYear = new Date(dateTo).getFullYear();
  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) years.push(y);
  return years;
}

// In-memory cache of reports by year, populated on first fetch per year per process.
// Avoids re-fetching the same year pages for every week in the backfill.
const yearCache = new Map<number, SsaOigReport[]>();

/** Fetch all reports for a given year, using cache if available. */
async function getReportsForYear(year: number, maxPages: number): Promise<SsaOigReport[]> {
  const cached = yearCache.get(year);
  if (cached) return cached;

  const yearPath = `${BASE_URL}${REPORTS_PATH}${year}/`;
  const firstPage = await fetchPage(yearPath);
  if (firstPage.reports.length === 0) {
    yearCache.set(year, []);
    return [];
  }

  const allReports = [...firstPage.reports];
  const pagesToFetch = Math.min(firstPage.totalPages, maxPages);

  if (pagesToFetch > 1) {
    console.log(
      `  [ssa-oig] ${year}: ${firstPage.totalPages} pages, fetching up to ${pagesToFetch}`,
    );
  }

  for (let page = 2; page <= pagesToFetch; page++) {
    await sleep(POLITENESS_DELAY_MS);
    const pageUrl = `${BASE_URL}${REPORTS_PATH}${year}/page/${page}/`;
    const { reports } = await fetchPage(pageUrl);
    if (reports.length === 0) break;
    allReports.push(...reports);
  }

  console.log(`  [ssa-oig] ${year}: cached ${allReports.length} reports`);
  yearCache.set(year, allReports);
  return allReports;
}

/** Fetch historical SSA OIG reports using year-based URLs, then filter to exact date range. */
export async function fetchSsaOigHistorical(params: {
  dateFrom: string;
  dateTo: string;
  maxPages?: number;
}): Promise<ContentItem[]> {
  const { maxPages = MAX_PAGES } = params;
  const fromDate = new Date(params.dateFrom);
  const toDate = new Date(params.dateTo);
  const years = getOverlappingYears(params.dateFrom, params.dateTo);

  const matched: SsaOigReport[] = [];

  for (const year of years) {
    const reports = await getReportsForYear(year, maxPages);
    for (const r of reports) {
      const d = new Date(r.publishedAt);
      if (d >= fromDate && d <= toDate) matched.push(r);
    }
  }

  if (matched.length > 0) {
    console.log(`  [ssa-oig] Found ${matched.length} reports in range`);
  }
  return matched.map(toContentItem);
}
