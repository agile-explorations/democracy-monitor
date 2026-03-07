import * as cheerio from 'cheerio';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const BASE_URL = 'https://oig.hhs.gov';
const REPORTS_PATH = '/reports/all/';
const FETCH_TIMEOUT_MS = 30_000;
const CRAWL_DELAY_MS = 10_000; // robots.txt: Crawl-delay: 10
const MAX_PAGES = 50;
const MAX_CONTENT_LENGTH = 8_000;

export interface HhsOigReport {
  title: string;
  url: string;
  publishedAt: string; // ISO date
  reportType: string;
  reportNumber: string;
  hhsAgency: string;
}

/**
 * Parse an HHS OIG signal URL.
 * Format: oig://hhs
 */
export function parseHhsOigParams(_signalUrl: string): Record<string, never> {
  return {};
}

/** Convert a parsed HHS OIG report to a ContentItem. */
export function toContentItem(report: HhsOigReport): ContentItem {
  return {
    title: report.title,
    link: report.url,
    pubDate: report.publishedAt,
    agency: `HHS OIG — ${report.hhsAgency}`,
    summary: `${report.reportType} ${report.reportNumber}`,
    type: 'ig_report',
    sourceOrigin: 'oig',
  };
}

/** Parse a single usa-card element into an HhsOigReport. */
export function parseReportCard($card: cheerio.Cheerio<cheerio.Element>): HhsOigReport | null {
  const linkEl = $card.find('.usa-card__heading a');
  const title = linkEl.text().trim();
  const href = linkEl.attr('href');
  if (!title || !href) return null;

  const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

  // Extract metadata from dl.pep-metadata
  let reportType = '';
  let reportNumber = '';
  let hhsAgency = '';
  let issuedDate = '';

  $card.find('.pep-metadata .grid-col').each((_i, col) => {
    const $col = cheerio.load(col);
    const term = $col('.pep-metadata__term').text().trim();
    const def = $col('.pep-metadata__def').text().trim();

    if (term === 'Issued') {
      issuedDate = def;
    } else if (term === 'HHS Agency') {
      hhsAgency = def;
    } else if (def && !reportType) {
      // First non-Issued, non-Agency field is the report type + number
      reportType = term;
      reportNumber = def;
    }
  });

  if (!issuedDate) return null;

  // Parse MM/DD/YYYY date format
  const dateParts = issuedDate.match(/(\d{2})\/(\d{2})\/(\d{4})/);
  if (!dateParts) return null;
  const publishedAt = new Date(
    `${dateParts[3]}-${dateParts[1]}-${dateParts[2]}T12:00:00Z`,
  ).toISOString();

  return {
    title,
    url,
    publishedAt,
    reportType: reportType || 'Report',
    reportNumber,
    hhsAgency: hhsAgency || 'HHS',
  };
}

/** Format YYYY-MM-DD as MM/DD/YYYY for HHS query params. */
function toHhsDate(isoDate: string): string {
  const [y, m, d] = isoDate.split('-');
  return `${m}/${d}/${y}`;
}

/** Build the HHS OIG reports URL with date-range and pagination. */
function buildReportsUrl(opts: { dateFrom?: string; dateTo?: string; page?: number }): string {
  let url = `${BASE_URL}${REPORTS_PATH}?issue-date=custom`;
  if (opts.dateFrom) url += `&from_date-=${toHhsDate(opts.dateFrom)}`;
  if (opts.dateTo) url += `&to_date-=${toHhsDate(opts.dateTo)}`;
  if (opts.page && opts.page > 1) url += `&page=${opts.page}`;
  return url;
}

/** Fetch a single page of HHS OIG reports and parse it. */
async function fetchPage(
  pageUrl: string,
): Promise<{ reports: HhsOigReport[]; totalPages: number }> {
  const response = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'DemocracyMonitor/1.0 (civic monitoring)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    console.error(`[hhs-oig] HTTP ${response.status} for ${pageUrl}`);
    return { reports: [], totalPages: 0 };
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const reports: HhsOigReport[] = [];
  $('li.usa-card').each((_i, el) => {
    const report = parseReportCard($(el));
    if (report) reports.push(report);
  });

  // Extract total pages from pagination
  let totalPages = 1;
  const lastPageLink = $('a[href*="page="]').last().attr('href');
  if (lastPageLink) {
    const pageMatch = lastPageLink.match(/page=(\d+)/);
    if (pageMatch) totalPages = parseInt(pageMatch[1], 10);
  }

  return { reports, totalPages };
}

/** Fetch recent HHS OIG reports for the snapshot pipeline. */
export async function fetchHhsOigRecent(_params: Record<string, never>): Promise<ContentItem[]> {
  const { reports } = await fetchPage(`${BASE_URL}${REPORTS_PATH}`);
  return reports.slice(0, 20).map(toContentItem);
}

/** Fetch historical HHS OIG reports for the backfill pipeline. */
export async function fetchHhsOigHistorical(params: {
  dateFrom: string;
  dateTo: string;
  maxPages?: number;
}): Promise<ContentItem[]> {
  const { maxPages = MAX_PAGES } = params;
  const url = buildReportsUrl({ dateFrom: params.dateFrom, dateTo: params.dateTo });

  const firstPage = await fetchPage(url);
  if (firstPage.reports.length === 0) return [];

  const allReports = [...firstPage.reports];
  const pagesToFetch = Math.min(firstPage.totalPages, maxPages);

  console.log(`  [hhs-oig] ${firstPage.totalPages} pages, fetching up to ${pagesToFetch}`);

  for (let page = 2; page <= pagesToFetch; page++) {
    await sleep(CRAWL_DELAY_MS);
    const pageUrl = buildReportsUrl({ dateFrom: params.dateFrom, dateTo: params.dateTo, page });
    const { reports } = await fetchPage(pageUrl);
    if (reports.length === 0) break;
    allReports.push(...reports);
  }

  console.log(`  [hhs-oig] Found ${allReports.length} reports in range`);
  return allReports.map(toContentItem);
}

/** Fetch the structured summary (Why/Found/Recommends) from an HHS OIG report detail page. */
export async function fetchHhsOigReportContent(reportUrl: string): Promise<string | null> {
  try {
    const response = await fetch(reportUrl, {
      headers: {
        'User-Agent': 'DemocracyMonitor/1.0 (civic monitoring)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);
    const proseEl = $('div.usa-prose.pep-prose');
    if (proseEl.length === 0) return null;

    const text = proseEl.text().replace(/\s+/g, ' ').trim();
    if (!text || text.length < 50) return null;

    return text.length > MAX_CONTENT_LENGTH ? text.slice(0, MAX_CONTENT_LENGTH) + '\u2026' : text;
  } catch (err) {
    console.warn(`[hhs-oig] Failed to scrape report content: ${err}`);
    return null;
  }
}
