import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const BASE_URL = 'https://www.oversight.gov';
const LISTING_PATH = '/reports/federal';
const FETCH_TIMEOUT_MS = 30_000;
const POLITENESS_DELAY_MS = 1_500;
const MAX_PAGES = 100;
const PAGE_SIZE = 10;

/**
 * The submitting-OIG facet term IDs this source ingests (verified live
 * 2026-08-01). DOJ/HHS/SSA/DHS are intentionally absent — they have direct
 * fetchers, and adding them here would double-ingest. DoD OIG is absent from
 * the oversight.gov facet entirely (verified anomaly; DODIG reports surface
 * only via full-text search) — a direct dodig.mil source is a follow-up.
 */
export const OVERSIGHT_OIGS: Record<number, { key: string; name: string }> = {
  283: { key: 'opm', name: 'Office of Personnel Management OIG' },
  313: { key: 'tigta', name: 'Treasury Inspector General for Tax Administration' },
  225: { key: 'treasury', name: 'Department of the Treasury OIG' },
  223: { key: 'state', name: 'Department of State OIG' },
  229: { key: 'eac', name: 'Election Assistance Commission OIG' },
  236: { key: 'fec', name: 'Federal Election Commission OIG' },
  284: { key: 'icig', name: 'Intelligence Community Inspector General' },
};

export interface OversightGovParams {
  oigs: number[];
}

export interface OversightGovReport {
  title: string;
  url: string; // canonical detail-page URL — the dedupe identity for this source
  publishedAt: string; // ISO date
  reportType: string;
  agencyReviewed: string;
  submittingOig?: string;
  reportNumber?: string;
  numRecs?: number;
  /** undefined = detail page not scraped; null = scraped and no hosted PDF exists. */
  pdfUrl?: string | null;
  /** The OIG's own site link ("External Link" field) — the only report access when pdfUrl is null. */
  externalUrl?: string | null;
}

/**
 * Parse an oversight.gov signal URL.
 * Format: oig://oversight?oigs=283 | oig://oversight?oigs=225,313
 */
export function parseOversightGovParams(signalUrl: string): OversightGovParams {
  const query = signalUrl.split('?')[1];
  const raw = query ? new URLSearchParams(query).get('oigs') : null;
  if (!raw) throw new Error(`[oversight-gov] Missing oigs param in signal URL: ${signalUrl}`);

  const oigs = raw.split(',').map((s) => parseInt(s.trim(), 10));
  for (const id of oigs) {
    if (!OVERSIGHT_OIGS[id]) {
      throw new Error(`[oversight-gov] Unknown submitting-OIG term ID ${id} in ${signalUrl}`);
    }
  }
  return { oigs };
}

/** Build a /reports/federal listing URL with date-range, facet, and pagination. */
export function buildListingUrl(opts: {
  oigs: number[];
  dateFrom: string;
  dateTo: string;
  page?: number;
}): string {
  const url = new URL(`${BASE_URL}${LISTING_PATH}`);
  url.searchParams.set('field_report_date_issued[min]', opts.dateFrom);
  url.searchParams.set('field_report_date_issued[max]', opts.dateTo);
  for (const id of opts.oigs) {
    url.searchParams.append('field_report_submitting_oig[]', String(id));
  }
  if (opts.page && opts.page > 0) url.searchParams.set('page', String(opts.page));
  return url.toString();
}

/** Extract the total result count from the "Displaying 1 - 10 of N" view footer. */
export function parseResultCount(html: string): number | null {
  const match = html.match(/Displaying\s+\d+\s*-\s*\d+\s+of\s+([\d,]+)/);
  return match ? parseInt(match[1].replace(/,/g, ''), 10) : null;
}

/**
 * Parse one listing-table data row (tr.listing-table__row). The title cell is
 * plain text; the detail-page link lives in the trailing action cell. Accordion
 * rows (highlights) interleave with data rows and are not matched.
 */
export function parseListingRow($row: cheerio.Cheerio<Element>): OversightGovReport | null {
  const datetime = $row.find('td.views-field-field-report-date-issued time').attr('datetime');
  if (!datetime) return null;

  const title = $row.find('td.views-field-title').text().trim();
  const href = $row.find('td.action-cell a').attr('href');
  if (!title || !href) return null;

  return {
    title,
    url: href.startsWith('http') ? href : `${BASE_URL}${href}`,
    publishedAt: new Date(datetime).toISOString(),
    reportType: $row.find('td.views-field-field-report-type').text().trim() || 'Report',
    agencyReviewed: $row.find('td.views-field-field-report-agency-reviewed').text().trim(),
  };
}

/** Read the value text of a Drupal field block (.field--name-<name> .field__item). */
function fieldItemText($: cheerio.CheerioAPI, name: string): string {
  return $(`.field--name-${name} .field__item`).first().text().trim();
}

/** Parse a report detail page for metadata and the oversight.gov-hosted PDF URL. */
export function parseDetailPage(html: string): {
  reportNumber: string;
  reportType: string;
  submittingOig: string;
  agencyReviewed: string;
  dateIssued: string | null;
  numRecs: number | null;
  pdfUrl: string | null;
  externalUrl: string | null;
} {
  const $ = cheerio.load(html);

  const agencies = $('.field--name-field-report-agency-reviewed .field__item')
    .map((_i, el) => $(el).text().trim())
    .get()
    .filter(Boolean);

  const pdfHref =
    $('a.report-download-button').first().attr('href') ??
    $('.field--name-field-media-document a[href$=".pdf"]').first().attr('href') ??
    null;

  const datetime = $('.field--name-field-report-date-issued time').attr('datetime');
  const numRecsText = fieldItemText($, 'field-report-number-of-recs');

  return {
    reportNumber: fieldItemText($, 'field-report-number'),
    reportType: fieldItemText($, 'field-report-type'),
    submittingOig: fieldItemText($, 'field-report-submitting-oig'),
    agencyReviewed: [...new Set(agencies)].join(', '),
    dateIssued: datetime ? new Date(datetime).toISOString() : null,
    numRecs: numRecsText ? parseInt(numRecsText, 10) : null,
    pdfUrl: pdfHref ? (pdfHref.startsWith('http') ? pdfHref : `${BASE_URL}${pdfHref}`) : null,
    externalUrl: $('.field--name-field-report-link .field__item a').first().attr('href') ?? null,
  };
}

async function fetchHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'DemocracyMonitor/1.0 (civic monitoring)',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`[oversight-gov] HTTP ${response.status} for ${url}`);
  return response.text();
}

/**
 * Scrape an oversight.gov report detail page for its PDF URL. Fallback for the
 * content pass when an item's metadata.pdfUrl is absent (e.g. legacy rows).
 */
export async function fetchOversightGovPdfUrl(detailUrl: string): Promise<string | null> {
  try {
    return parseDetailPage(await fetchHtml(detailUrl)).pdfUrl;
  } catch (err) {
    console.warn(`[oversight-gov] Failed to scrape PDF link: ${err}`);
    return null;
  }
}

/** Convert a parsed oversight.gov report to a ContentItem. */
export function toContentItem(report: OversightGovReport): ContentItem {
  return {
    title: report.title,
    link: report.url,
    pubDate: report.publishedAt,
    agency: report.submittingOig
      ? `${report.submittingOig} (via Oversight.gov)`
      : 'Federal Inspector General (via Oversight.gov)',
    content: `${report.reportType} — ${report.reportNumber || report.title}`.trim(),
    type: 'ig_report',
    sourceOrigin: 'oig',
    // pdfUrl === null means the detail page was scraped and no hosted PDF
    // exists (e.g. State OIG links externally to its 403-walled site since
    // 2025) — the report body is unobtainable, so mark metadata_only at
    // ingest rather than storing a full_text-labeled stub (#645 pattern).
    contentType: report.pdfUrl === null ? 'metadata_only' : undefined,
    metadata: {
      submittingOig: report.submittingOig ?? null,
      reportNumber: report.reportNumber ?? null,
      reportType: report.reportType,
      agencyReviewed: report.agencyReviewed,
      numRecs: report.numRecs ?? null,
      pdfUrl: report.pdfUrl ?? null,
      externalUrl: report.externalUrl ?? null,
    },
  };
}

/** Scrape a report's detail page in place; a failed scrape leaves listing fields intact. */
async function enrichFromDetailPage(report: OversightGovReport): Promise<void> {
  try {
    const detail = parseDetailPage(await fetchHtml(report.url));
    report.reportNumber = detail.reportNumber;
    report.submittingOig = detail.submittingOig;
    report.numRecs = detail.numRecs ?? undefined;
    report.pdfUrl = detail.pdfUrl;
    report.externalUrl = detail.externalUrl;
    if (detail.reportType) report.reportType = detail.reportType;
    if (detail.agencyReviewed) report.agencyReviewed = detail.agencyReviewed;
  } catch (err) {
    console.warn(`[oversight-gov] Detail scrape failed for ${report.url}: ${err}`);
  }
}

/**
 * Fetch oversight.gov reports for [dateFrom, dateTo] for one signal's OIG set.
 * The date range and facet are server-side; a client-side date guard remains as
 * a safety net for boundary semantics. Each report's detail page is scraped to
 * populate metadata (report number, submitting OIG, PDF URL); PDF text
 * extraction stays with the shared fillOigContent driver.
 *
 * skipDetailUrls: detail-page URLs to return without the detail scrape — lets
 * the backfill's --skip-existing pass avoid re-scraping documents it already
 * holds with full content. skipDetail skips ALL detail scrapes (dry-run counts).
 */
export async function fetchOversightGovHistorical(params: {
  oigs: number[];
  dateFrom: string;
  dateTo: string;
  maxPages?: number;
  skipDetailUrls?: Set<string>;
  skipDetail?: boolean;
}): Promise<ContentItem[]> {
  const { oigs, dateFrom, dateTo, maxPages = MAX_PAGES, skipDetailUrls, skipDetail } = params;

  const reports: OversightGovReport[] = [];
  let expectedCount: number | null = null;
  for (let page = 0; page < maxPages; page++) {
    if (page > 0) await sleep(POLITENESS_DELAY_MS);
    const html = await fetchHtml(buildListingUrl({ oigs, dateFrom, dateTo, page }));
    if (page === 0) expectedCount = parseResultCount(html);

    const $ = cheerio.load(html);
    const rows = $('tr.listing-table__row')
      .map((_i, el) => parseListingRow($(el)))
      .get()
      .filter((r): r is OversightGovReport => r !== null);

    const inRange = rows.filter((r) => {
      const day = r.publishedAt.slice(0, 10);
      return day >= dateFrom && day <= dateTo;
    });
    reports.push(...inRange);

    if (rows.length < PAGE_SIZE) break;
    if (expectedCount !== null && (page + 1) * PAGE_SIZE >= expectedCount) break;
  }

  // Walk-drift detector: a persistent mismatch means the Drupal view markup or
  // pagination changed and the walk is silently under-collecting.
  if (expectedCount !== null && reports.length !== expectedCount) {
    console.warn(
      `[oversight-gov] Walked ${reports.length} of expected ${expectedCount} for oigs=${oigs.join(',')} ${dateFrom}..${dateTo}`,
    );
  }

  for (const report of reports) {
    if (skipDetail || skipDetailUrls?.has(report.url)) continue;
    await sleep(POLITENESS_DELAY_MS);
    await enrichFromDetailPage(report);
  }

  console.log(
    `  [oversight-gov] ${reports.length} reports for oigs=${oigs.join(',')} ${dateFrom}..${dateTo}`,
  );
  return reports.map(toContentItem);
}
