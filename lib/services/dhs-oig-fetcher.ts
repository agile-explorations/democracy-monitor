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
 * DHS OIG's own component tags, exposed as a server-side listing filter
 * (field_dhs_agency_target_id). Every component view is walked: the unfiltered
 * view has proven coverage holes (OIG-20-80 appears only in the ICE view), and
 * the tags become stored document metadata (dhsComponents).
 */
const DHS_COMPONENT_FILTER_IDS: ReadonlyArray<{ component: string; id: number }> = [
  { component: 'CBP', id: 1 },
  { component: 'FEMA', id: 2 },
  { component: 'ICE', id: 3 },
  { component: 'MGMT', id: 4 },
  { component: 'TSA', id: 5 },
  { component: 'USCIS', id: 6 },
  { component: 'USCG', id: 7 },
  { component: 'USSS', id: 8 },
  { component: 'Others', id: 9 },
  { component: 'CISA', id: 2632 },
];

export const DHS_IMMIGRATION_COMPONENTS: ReadonlyArray<string> = ['ICE', 'CBP', 'USCIS'];

/**
 * Title supplement for the immigration routing rule: catches immigration-subject
 * reports tagged to non-immigration components (e.g. "DHS Does Not Have
 * Assurance That All Migrants Can be Located…" is tagged MGMT). Acronyms are
 * matched case-sensitively: a case-insensitive \bICE\b would match FEMA
 * "ice storm" disaster reports. Quoted verbatim in the data dictionary.
 */
export const DHS_IMMIGRATION_ACRONYM_PATTERN = /\b(ICE|CBP|USCIS)\b/;
export const DHS_IMMIGRATION_TERM_PATTERN =
  /border|immigra|detention|detainee|deportation|asylum|287\(g\)|migrant|unaccompanied|correctional (facilit|center)|processing center|ports? of entry|\balien\b|expedited removal/i;

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
  /** Official DHS OIG component tags collected from the filtered listing views. */
  components: string[];
}

/**
 * Immigration routing rule (#602, owner-approved union): official component
 * tag (ICE/CBP/USCIS) OR immigration-subject title. Tags are primary — they
 * catch facility inspections whose titles never name a component (Theo Lacy,
 * Winn Correctional Center); the title supplement catches cross-component
 * immigration reports tagged MGMT/FEMA/Others.
 */
export function isImmigrationReport(report: Pick<DhsOigReport, 'title' | 'components'>): boolean {
  return (
    report.components.some((c) => DHS_IMMIGRATION_COMPONENTS.includes(c)) ||
    isImmigrationRelatedTitle(report.title)
  );
}

/** ContentItem-level twin of isImmigrationReport, for the bulk driver. */
export function isImmigrationContentItem(item: ContentItem): boolean {
  const components = (item.metadata?.dhsComponents as string[] | undefined) ?? [];
  return isImmigrationReport({ title: item.title ?? '', components });
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
    metadata: { dhsComponents: report.components },
  };
}

/** Parse a single listing-table <tr> into a DhsOigReport (components added by the walk). */
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
    components: [],
  };
}

/**
 * Merge the unfiltered + component-filtered walks into a unique report set.
 * Identity is the report number (whistleblower ROIs without one fall back to
 * URL); the same report appears in multiple listings under DIFFERENT PDF paths
 * (e.g. assets/2019-05/OIG-19-46… vs assets/Mga/2019/oig-19-46…), so URL-keyed
 * storage cannot dedupe it. First occurrence wins for fields; component tags
 * union across walks.
 */
export function mergeReportWalks(
  walks: Array<{ component: string | null; reports: DhsOigReport[] }>,
): DhsOigReport[] {
  const byKey = new Map<string, DhsOigReport>();
  for (const walk of walks) {
    for (const report of walk.reports) {
      const key = report.reportNumber.toUpperCase() || report.url;
      const existing = byKey.get(key);
      const merged = existing ?? { ...report, components: [] };
      if (walk.component && !merged.components.includes(walk.component)) {
        merged.components.push(walk.component);
      }
      if (!existing) byKey.set(key, merged);
    }
  }
  return [...byKey.values()];
}

/** Fetch and parse one listing page, optionally component-filtered. */
async function fetchPage(
  path: string,
  page: number,
  reportType: string,
  componentId?: number,
): Promise<DhsOigReport[]> {
  const params = new URLSearchParams();
  if (componentId !== undefined) params.set('field_dhs_agency_target_id', String(componentId));
  if (page > 0) params.set('page', String(page));
  const qs = params.toString();
  const pageUrl = qs ? `${BASE_URL}${path}?${qs}` : `${BASE_URL}${path}`;

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
 * Walk one listing view newest-first, keeping rows within [dateFrom, dateTo].
 * The DHS views expose no date query filter, so filtering is client-side;
 * the walk stops once an entire page predates dateFrom.
 */
async function fetchListingRange(
  listing: { path: string; reportType: string },
  dateFrom: string,
  dateTo: string,
  maxPages: number,
  componentId?: number,
): Promise<DhsOigReport[]> {
  const inRange: DhsOigReport[] = [];
  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await sleep(POLITENESS_DELAY_MS);
    const reports = await fetchPage(listing.path, page, listing.reportType, componentId);
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
 * Fetch historical DHS OIG reports for the backfill pipeline: every listing is
 * walked unfiltered AND once per component filter, then merged.
 */
export async function fetchDhsOigHistorical(params: {
  dateFrom: string;
  dateTo: string;
  components?: 'immigration';
  maxPages?: number;
}): Promise<ContentItem[]> {
  const { dateFrom, dateTo, maxPages = MAX_PAGES } = params;
  const walks: Array<{ component: string | null; reports: DhsOigReport[] }> = [];

  for (const listing of LISTINGS) {
    walks.push({
      component: null,
      reports: await fetchListingRange(listing, dateFrom, dateTo, maxPages),
    });
    for (const { component, id } of DHS_COMPONENT_FILTER_IDS) {
      await sleep(POLITENESS_DELAY_MS);
      walks.push({
        component,
        reports: await fetchListingRange(listing, dateFrom, dateTo, maxPages, id),
      });
    }
    console.log(
      `  [dhs-oig] ${listing.path}: walked unfiltered + ${DHS_COMPONENT_FILTER_IDS.length} component views`,
    );
  }

  const unique = mergeReportWalks(walks);
  const filtered =
    params.components === 'immigration' ? unique.filter((r) => isImmigrationReport(r)) : unique;

  console.log(`  [dhs-oig] ${filtered.length} reports in range (${unique.length} unique)`);
  return filtered.map(toContentItem);
}
