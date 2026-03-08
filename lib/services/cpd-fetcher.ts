/**
 * CPD (Compilation of Presidential Documents) fetcher via GovInfo API.
 *
 * Fetches presidential documents from the DCPD collection and routes them
 * to monitoring categories using NARA subject metadata.
 *
 * Unlike signal-based fetchers, CPD documents are category-agnostic at fetch
 * time — each document maps to zero or more categories via subject terms.
 * The caller is responsible for storing each item in its mapped categories.
 *
 * GovInfo API: POST /search (paginated), GET /packages/{id}/summary, GET /packages/{id}/htm
 * Rate limit: 36,000 requests/hour (~10/sec)
 */

import { mapSubjectsToCategories } from '@/lib/data/cpd-subject-map';
import { stripHtml } from '@/lib/parsers/feed-parser';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const GOVINFO_API_BASE = 'https://api.govinfo.gov';
const RATE_LIMIT_DELAY_MS = 200;
const FETCH_TIMEOUT_MS = 30_000;
const MAX_CONTENT_LENGTH = 8_000;
const USER_AGENT = 'DemocracyMonitor/1.0 (cpd-fetcher)';

/** Admin package IDs to skip (nominations lists, checklists, digests). */
const ADMIN_PACKAGE_PATTERNS = ['NOMINATIONS', 'CHECKLIST', 'DIGEST'];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CpdSearchResult {
  packageId?: string;
  title?: string;
  dateIssued?: string;
  collectionCode?: string;
  download?: { txtLink?: string; pdfLink?: string; htmlLink?: string };
}

interface CpdSearchResponse {
  results?: CpdSearchResult[];
  count?: number;
  offsetMark?: string | null;
}

interface CpdSummary {
  title?: string;
  dateIssued?: string;
  subject?: Array<{ level1?: string }>;
  dcpdCategory?: Array<{ level1?: string; level2?: string }>;
  download?: { txtLink?: string; pdfLink?: string; htmlLink?: string };
}

/** A fetched CPD document with its mapped categories. */
export interface CpdDocument {
  item: ContentItem;
  categories: string[];
  unmappedSubjects: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getApiKey(): string | undefined {
  return process.env.GOVINFO_API_KEY;
}

function isAdminPackage(packageId: string): boolean {
  return ADMIN_PACKAGE_PATTERNS.some((p) => packageId.includes(p));
}

/** Map dcpdCategory to a sourceType for the document. */
function mapDcpdCategoryToType(dcpdCategory?: Array<{ level1?: string }>): string {
  const cat = dcpdCategory?.[0]?.level1?.toLowerCase() ?? '';
  if (cat.includes('executive order')) return 'executive_order';
  if (cat.includes('memorand')) return 'presidential_memorandum';
  if (cat.includes('proclamation')) return 'proclamation';
  if (cat.includes('letter')) return 'presidential_letter';
  if (cat.includes('statement')) return 'presidential_statement';
  if (cat.includes('remark') || cat.includes('address')) return 'presidential_remarks';
  if (cat.includes('interview')) return 'presidential_interview';
  return 'presidential_document';
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/** Execute a GovInfo search POST request for CPD documents. */
async function searchCpd(
  query: string,
  apiKey: string,
  pageSize: number,
  offsetMark: string,
): Promise<CpdSearchResponse> {
  const response = await fetch(`${GOVINFO_API_BASE}/search?api_key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': USER_AGENT },
    body: JSON.stringify({
      query,
      pageSize: String(pageSize),
      offsetMark,
      sorts: [{ field: 'publishdate', sortOrder: 'ASC' }],
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`[cpd-fetcher] Search HTTP ${response.status}: ${body.slice(0, 200)}`);
    return { results: [], count: 0, offsetMark: null };
  }

  return response.json();
}

/** Fetch the summary (metadata + subjects) for a single CPD package. */
async function fetchCpdSummary(packageId: string, apiKey: string): Promise<CpdSummary | null> {
  try {
    const url = `${GOVINFO_API_BASE}/packages/${packageId}/summary?api_key=${apiKey}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return response.json();
  } catch (err) {
    console.warn(`[cpd-fetcher] Summary fetch failed for ${packageId}:`, err);
    return null;
  }
}

/** Fetch HTML content for a CPD package and return stripped plaintext. */
export async function fetchCpdText(packageId: string): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  try {
    const url = `${GOVINFO_API_BASE}/packages/${packageId}/htm?api_key=${apiKey}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const html = await response.text();
    const text = stripHtml(html).replace(/\0/g, '').trim();
    return text.length > MAX_CONTENT_LENGTH
      ? text.slice(0, MAX_CONTENT_LENGTH) + '\u2026'
      : text || null;
  } catch (err) {
    console.warn(`[cpd-fetcher] Content fetch failed for ${packageId}:`, err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// ContentItem conversion
// ---------------------------------------------------------------------------

/** Convert a CPD summary to a ContentItem (without content — filled separately). */
export function summaryToContentItem(packageId: string, summary: CpdSummary): ContentItem {
  const detailsUrl = `https://www.govinfo.gov/app/details/${packageId}`;
  const downloadUrl =
    summary.download?.htmlLink ||
    summary.download?.pdfLink ||
    summary.download?.txtLink ||
    detailsUrl;

  return {
    title: summary.title || '(untitled document)',
    link: downloadUrl,
    pubDate: summary.dateIssued,
    agency: 'Executive Office of the President',
    type: mapDcpdCategoryToType(summary.dcpdCategory),
    sourceOrigin: 'govinfo_cpd',
    metadata: {
      packageId,
      collectionCode: 'DCPD',
      dcpdCategory: summary.dcpdCategory?.[0]?.level1,
      subjects: summary.subject?.map((s) => s.level1).filter(Boolean),
    },
  };
}

// ---------------------------------------------------------------------------
// Multi-step fetch pipeline
// ---------------------------------------------------------------------------

/** Phase 1: Paginated search to collect all package IDs for a date range. */
async function collectPackageIds(
  query: string,
  apiKey: string,
  maxPages: number,
): Promise<string[]> {
  const packageIds: string[] = [];
  let offsetMark = '*';
  const pageSize = 100;

  for (let page = 0; page < maxPages; page++) {
    const data = await searchCpd(query, apiKey, pageSize, offsetMark);
    const results = data.results || [];
    if (results.length === 0) break;

    for (const r of results) {
      if (r.packageId && !isAdminPackage(r.packageId)) {
        packageIds.push(r.packageId);
      }
    }

    if (!data.offsetMark || results.length < pageSize) break;
    offsetMark = data.offsetMark;
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return packageIds;
}

/** Phase 2+3: Enrich each package with summary, subject mapping, and optional content. */
async function enrichPackages(
  packageIds: string[],
  apiKey: string,
  fetchContent: boolean,
): Promise<{ docs: CpdDocument[]; unmappedCount: number }> {
  const allDocs: CpdDocument[] = [];
  const globalUnmapped = new Set<string>();

  for (let i = 0; i < packageIds.length; i++) {
    const packageId = packageIds[i];
    const summary = await fetchCpdSummary(packageId, apiKey);
    if (!summary) continue;

    const subjects = (summary.subject || []).map((s) => s.level1).filter((s): s is string => !!s);

    const unmapped = new Set<string>();
    const categories = mapSubjectsToCategories(subjects, unmapped);
    for (const s of unmapped) globalUnmapped.add(s);

    if (categories.length === 0) continue;

    const item = summaryToContentItem(packageId, summary);

    if (fetchContent) {
      const text = await fetchCpdText(packageId);
      if (text) item.summary = text;
    }

    allDocs.push({ item, categories, unmappedSubjects: [...unmapped] });

    if ((i + 1) % 50 === 0) {
      console.log(`[cpd-fetcher] Processed ${i + 1}/${packageIds.length} packages`);
    }

    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return { docs: allDocs, unmappedCount: globalUnmapped.size };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch CPD documents for a date range with subject-based category routing.
 * Returns CpdDocument[] — the caller stores each item in its mapped categories.
 */
export async function fetchCpdHistorical(params: {
  dateFrom: string;
  dateTo: string;
  maxPages?: number;
  fetchContent?: boolean;
}): Promise<CpdDocument[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[cpd-fetcher] GOVINFO_API_KEY not set, skipping fetch');
    return [];
  }

  const { dateFrom, dateTo, maxPages = 20, fetchContent = true } = params;
  const query = `collection:CPD publishdate:range(${dateFrom},${dateTo})`;

  const packageIds = await collectPackageIds(query, apiKey, maxPages);
  if (packageIds.length === 0) return [];
  console.log(`[cpd-fetcher] Found ${packageIds.length} packages for ${dateFrom}–${dateTo}`);

  const { docs, unmappedCount } = await enrichPackages(packageIds, apiKey, fetchContent);

  if (unmappedCount > 0) {
    console.log(`[cpd-fetcher] ${unmappedCount} unmapped subjects encountered (logged for review)`);
  }
  console.log(
    `[cpd-fetcher] ${docs.length} documents with category mappings (${packageIds.length - docs.length} skipped — no category match)`,
  );

  return docs;
}
