import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const BASE_URL = 'https://www.oig.dhs.gov';
const FETCH_TIMEOUT_MS = 30_000;
const POLITENESS_DELAY_MS = 2_000;
const MAX_PAGES = 60;

/** Listing views walked by the historical fetch, newest-first, 50 rows/page. */
const LISTINGS: ReadonlyArray<{ path: string; reportType: string }> = [
  { path: '/reports/audits-inspections-and-evaluations', reportType: 'Audit/Inspection' },
  { path: '/reports/management-alerts', reportType: 'Management Alert' },
  {
    path: '/reports/whistleblower-retaliation-reports-of-investigation',
    reportType: 'Whistleblower Retaliation Investigation',
  },
];

/**
 * Title filter for the immigrationEnforcement signal (oig://dhs?components=immigration).
 * Acronyms are matched case-sensitively: a case-insensitive \bICE\b would match
 * FEMA "ice storm" disaster reports. Quoted verbatim in the data dictionary.
 */
export const DHS_IMMIGRATION_ACRONYM_PATTERN = /\b(ICE|CBP|USCIS)\b/;
export const DHS_IMMIGRATION_TERM_PATTERN =
  /border|immigra|detention|detainee|deportation|asylum|287\(g\)|migrant|unaccompanied|correctional facilit|processing center|ports? of entry|\balien\b|expedited removal/i;

/** True when a DHS OIG report title concerns an immigration component or subject. */
export function isImmigrationRelatedTitle(title: string): boolean {
  return DHS_IMMIGRATION_ACRONYM_PATTERN.test(title) || DHS_IMMIGRATION_TERM_PATTERN.test(title);
}

export interface DhsOigParams {
  components?: 'immigration';
}

export interface DhsOigReport {
  title: string;
  url: string; // direct PDF URL — DHS listings link straight to the report PDF
  publishedAt: string; // ISO date
  reportType: string;
  reportNumber: string;
}

/**
 * Parse a DHS OIG signal URL.
 * Formats: oig://dhs | oig://dhs?components=immigration
 */
export function parseDhsOigParams(signalUrl: string): DhsOigParams {
  const query = signalUrl.split('?')[1];
  if (!query) return {};
  const components = new URLSearchParams(query).get('components');
  return components === 'immigration' ? { components: 'immigration' } : {};
}

/** Convert a parsed DHS OIG report to a ContentItem. */
export function toContentItem(report: DhsOigReport): ContentItem {
  return {
    title: report.title,
    link: report.url,
    pubDate: report.publishedAt,
    agency: 'DHS Office of Inspector General',
    content: `${report.reportType} — ${report.reportNumber}`.trim(),
    type: 'ig_report',
    sourceOrigin: 'oig',
  };
}

/** Parse a single listing-table <tr> into a DhsOigReport. */
export function parseReportRow(
  $row: cheerio.Cheerio<Element>,
  reportType: string,
): DhsOigReport | null {
  const datetime = $row.find('time.datetime').attr('datetime');
  if (!datetime) return null;

  const linkEl = $row.find('td.views-field-title a');
  const title = linkEl.text().trim();
  const href = linkEl.attr('href');
  if (!title || !href) return null;

  const url = href.startsWith('http') ? href : `${BASE_URL}${href}`;
  const reportNumber = $row.find('td.views-field-field-report-number').text().trim();

  return {
    title,
    url,
    publishedAt: new Date(datetime).toISOString(),
    reportType,
    reportNumber,
  };
}

/** Fetch and parse one listing page. */
async function fetchPage(path: string, page: number, reportType: string): Promise<DhsOigReport[]> {
  const pageUrl = page > 0 ? `${BASE_URL}${path}?page=${page}` : `${BASE_URL}${path}`;
  const response = await fetch(pageUrl, {
    headers: {
      'User-Agent': 'DemocracyMonitor/1.0 (civic monitoring)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`[dhs-oig] HTTP ${response.status} for ${pageUrl}`);
  }

  const $ = cheerio.load(await response.text());
  const reports: DhsOigReport[] = [];
  $('table tbody tr').each((_i, el) => {
    const report = parseReportRow($(el), reportType);
    if (report) reports.push(report);
  });
  return reports;
}

/**
 * Walk one listing newest-first, keeping rows within [dateFrom, dateTo].
 * The DHS views expose no date query filter, so filtering is client-side;
 * the walk stops once an entire page predates dateFrom.
 */
async function fetchListingRange(
  listing: { path: string; reportType: string },
  dateFrom: string,
  dateTo: string,
  maxPages: number,
): Promise<DhsOigReport[]> {
  const inRange: DhsOigReport[] = [];
  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await sleep(POLITENESS_DELAY_MS);
    const reports = await fetchPage(listing.path, page, listing.reportType);
    if (reports.length === 0) break;

    for (const report of reports) {
      const day = report.publishedAt.slice(0, 10);
      if (day >= dateFrom && day <= dateTo) inRange.push(report);
    }
    const allOlderThanRange = reports.every((r) => r.publishedAt.slice(0, 10) < dateFrom);
    if (allOlderThanRange) break;
  }
  return inRange;
}

/**
 * Collapse cross-listed reports: the same report (same OIG number) appears in
 * both the audits and management-alerts listings under DIFFERENT PDF paths
 * (e.g. assets/2019-05/OIG-19-46-May19.pdf vs assets/Mga/2019/oig-19-46-…),
 * so URL-keyed storage cannot dedupe them. First listing wins; reports
 * without a number (whistleblower ROIs) fall back to URL identity.
 */
export function dedupeByReportNumber(reports: DhsOigReport[]): DhsOigReport[] {
  const seen = new Set<string>();
  const unique: DhsOigReport[] = [];
  for (const report of reports) {
    const key = report.reportNumber.toUpperCase() || report.url;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(report);
  }
  return unique;
}

/** Fetch historical DHS OIG reports across all listings for the backfill pipeline. */
export async function fetchDhsOigHistorical(params: {
  dateFrom: string;
  dateTo: string;
  components?: 'immigration';
  maxPages?: number;
}): Promise<ContentItem[]> {
  const { dateFrom, dateTo, maxPages = MAX_PAGES } = params;
  const all: DhsOigReport[] = [];

  for (const listing of LISTINGS) {
    const reports = await fetchListingRange(listing, dateFrom, dateTo, maxPages);
    console.log(`  [dhs-oig] ${listing.path}: ${reports.length} reports in range`);
    all.push(...reports);
    await sleep(POLITENESS_DELAY_MS);
  }

  const unique = dedupeByReportNumber(all);
  const filtered =
    params.components === 'immigration'
      ? unique.filter((r) => isImmigrationRelatedTitle(r.title))
      : unique;

  console.log(
    `  [dhs-oig] ${filtered.length} reports total (${all.length} fetched, ${all.length - unique.length} cross-listed dupes)`,
  );
  return filtered.map(toContentItem);
}
