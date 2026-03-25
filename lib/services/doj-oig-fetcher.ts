import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const BASE_URL = 'https://oig.justice.gov';
const REPORTS_PATH = '/reports';
const FETCH_TIMEOUT_MS = 30_000;
const POLITENESS_DELAY_MS = 2_000;
const MAX_PAGES = 50;

export interface DojOigReport {
  title: string;
  url: string;
  publishedAt: string; // ISO date
  reportType: string;
  component: string;
}

/**
 * Parse a DOJ OIG signal URL.
 * Format: oig://doj
 */
export function parseDojOigParams(_signalUrl: string): Record<string, never> {
  return {};
}

/** Convert a parsed DOJ OIG report to a ContentItem. */
export function toContentItem(report: DojOigReport): ContentItem {
  return {
    title: report.title,
    link: report.url,
    pubDate: report.publishedAt,
    agency: 'DOJ Office of the Inspector General',
    content: `${report.reportType} — ${report.component}`,
    type: 'ig_report',
    sourceOrigin: 'oig',
  };
}

/** Parse a single views-row element into a DojOigReport. */
export function parseReportRow(
  $row: cheerio.Cheerio<Element>,
  $: cheerio.CheerioAPI,
): DojOigReport | null {
  const timeEl = $row.find('time.datetime');
  const datetime = timeEl.attr('datetime');
  if (!datetime) return null;

  const linkEl = $row.find('.views-field-title a');
  const title = linkEl.text().trim();
  const href = linkEl.attr('href');
  if (!title || !href) return null;

  const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;

  // Report type appears as a span after "Type: "
  const rowHtml = $.html($row);
  const typeMatch = rowHtml.match(/<span>Type:\s*<\/span>\s*<span>([^<]+)<\/span>/);
  const reportType = typeMatch?.[1]?.trim() || 'Report';

  const componentEl = $row.find('.views-field-field-doj-component .field-content');
  const component = componentEl.text().trim() || 'DOJ OIG';

  return {
    title,
    url,
    publishedAt: new Date(datetime).toISOString(),
    reportType,
    component,
  };
}

/** Build the DOJ OIG reports URL with date-range and pagination. */
function buildReportsUrl(opts: { dateFrom?: string; dateTo?: string; page?: number }): string {
  const url = new URL(`${BASE_URL}${REPORTS_PATH}`);
  if (opts.dateFrom) url.searchParams.set('field_publication_date_value', opts.dateFrom);
  if (opts.dateTo) url.searchParams.set('field_publication_date_value_1', opts.dateTo);
  if (opts.page && opts.page > 0) url.searchParams.set('page', String(opts.page));
  return url.toString();
}

/** Fetch a single page of DOJ OIG reports HTML and parse it. */
async function fetchPage(
  pageUrl: string,
): Promise<{ reports: DojOigReport[]; totalPages: number }> {
  const response = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'DemocracyMonitor/1.0 (civic monitoring)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`[doj-oig] HTTP ${response.status} for ${pageUrl}`);
  }

  const html = await response.text();
  const $ = cheerio.load(html);

  const reports: DojOigReport[] = [];
  $('.views-row').each((_i, el) => {
    const report = parseReportRow($(el), $);
    if (report) reports.push(report);
  });

  // Extract total pages from the pager's "last" link
  let totalPages = 1;
  const lastLink = $('li.pager__item--last a').attr('href');
  if (lastLink) {
    const pageMatch = lastLink.match(/page=(\d+)/);
    if (pageMatch) totalPages = parseInt(pageMatch[1], 10) + 1;
  }

  return { reports, totalPages };
}

/** Fetch historical DOJ OIG reports for the backfill pipeline. */
export async function fetchDojOigHistorical(params: {
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

  console.log(`  [doj-oig] ${firstPage.totalPages} pages, fetching up to ${pagesToFetch}`);

  for (let page = 1; page < pagesToFetch; page++) {
    await sleep(POLITENESS_DELAY_MS);
    const pageUrl = buildReportsUrl({ dateFrom: params.dateFrom, dateTo: params.dateTo, page });
    const { reports } = await fetchPage(pageUrl);
    if (reports.length === 0) break;
    allReports.push(...reports);
  }

  console.log(`  [doj-oig] Found ${allReports.length} reports in range`);
  return allReports.map(toContentItem);
}

/** Scrape a DOJ OIG report detail page for its PDF download link. */
export async function fetchDojOigPdfUrl(detailUrl: string): Promise<string | null> {
  try {
    const response = await fetch(detailUrl, {
      headers: {
        'User-Agent': 'DemocracyMonitor/1.0 (civic monitoring)',
        Accept: 'text/html',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const html = await response.text();
    const $ = cheerio.load(html);
    const pdfLink = $('a[href$=".pdf"]').first().attr('href');
    if (!pdfLink) return null;

    return pdfLink.startsWith('http') ? pdfLink : `${BASE_URL}${pdfLink}`;
  } catch (err) {
    console.warn(`[doj-oig] Failed to scrape PDF link: ${err}`);
    return null;
  }
}
