/**
 * CLI: pnpm backfill:content [--source fr|govinfo|oig|fec|doj] [--dry-run] [--limit N]
 *
 * Backfills null-content documents with full text:
 * - FR (all types): fetches raw_text_url from FR API, then raw text
 * - GovInfo Congressional Reports: fetches /packages/{id}/htm from GovInfo API
 * - OIG (HHS/DOJ/SSA Inspector General): HHS detail page HTML, DOJ/SSA PDF extraction
 * - FEC (MURs/Advisory Opinions): re-fetches structured data + PDF text extraction
 * - DOJ Press Releases: re-fetches full body from DOJ API (replaces truncated teasers)
 *
 * Sets embedded_at = NULL on updated docs so `pnpm embeddings:backfill` re-embeds them.
 */

import { eq, isNull, and, or, sql, like, lt } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { stripHtml } from '@/lib/parsers/feed-parser';
import { fetchDojOigPdfUrl } from '@/lib/services/doj-oig-fetcher';
import { fetchFecEnrichedContent } from '@/lib/services/fec-content';
import { fetchGovInfoText } from '@/lib/services/govinfo-fetcher';
import { fetchHhsOigReportContent } from '@/lib/services/hhs-oig-fetcher';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';
import { extractPdfText } from '@/lib/utils/pdf-extractor';

const BATCH_SIZE = 50;
const RATE_LIMIT_MS = 200;
const MAX_CONTENT_LENGTH = 8_000;
const FR_FETCH_TIMEOUT_MS = 30_000;
const DOJ_API_BASE = 'https://www.justice.gov/api/v1/press_releases.json';
const DOJ_FETCH_TIMEOUT_MS = 30_000;
const DOJ_PAGE_SIZE = 50;
const DOJ_POLITENESS_DELAY_MS = 2_000;
const DOJ_OIG_CRAWL_DELAY_MS = 5_000; // robots.txt: Crawl-delay: 5
const HHS_OIG_CRAWL_DELAY_MS = 10_000; // robots.txt: Crawl-delay: 10
const SSA_OIG_RATE_LIMIT_MS = 2_000; // no robots.txt crawl-delay, be polite
const FEC_RATE_LIMIT_MS = 4_000; // FEC allows ~1,000 req/hr
const DOJ_SHORT_CONTENT_THRESHOLD = 1_000; // DOJ teasers are ~800 chars

type Source = 'fr' | 'govinfo' | 'oig' | 'fec' | 'doj';

interface BackfillOptions {
  sources: Source[];
  dryRun: boolean;
  limit: number | null;
}

function truncateContent(text: string): string {
  return text.length > MAX_CONTENT_LENGTH ? text.slice(0, MAX_CONTENT_LENGTH) + '\u2026' : text;
}

/**
 * Extract FR document number from a federalregister.gov URL.
 * URL pattern: https://www.federalregister.gov/documents/YYYY/MM/DD/DOCNUM/slug
 */
function extractDocNumber(url: string): string | null {
  const match = url.match(/federalregister\.gov\/documents\/\d{4}\/\d{2}\/\d{2}\/([\w-]+)\//);
  return match ? match[1] : null;
}

async function fetchFrContentUrl(docNumber: string): Promise<string | null> {
  try {
    const url = `https://www.federalregister.gov/api/v1/documents/${docNumber}.json?fields[]=raw_text_url&fields[]=body_html_url`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DemocracyMonitor/1.0 (content-backfill)',
      },
      signal: AbortSignal.timeout(FR_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.raw_text_url || data.body_html_url || null;
  } catch {
    return null;
  }
}

async function fetchRawText(rawTextUrl: string): Promise<string | null> {
  try {
    const response = await fetch(rawTextUrl, {
      headers: { 'User-Agent': 'DemocracyMonitor/1.0 (content-backfill)' },
      signal: AbortSignal.timeout(FR_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const html = await response.text();
    const text = stripHtml(html).replace(/\0/g, '').trim();
    return text ? truncateContent(text) : null;
  } catch {
    return null;
  }
}

async function backfillFr(options: BackfillOptions): Promise<number> {
  const db = getDb();

  // Find all FR documents with null or abstract-only content (< 400 chars).
  // Previously only targeted Presidential Documents; now includes Notice, Rule, Proposed Rule.
  const rows = await db
    .select({ id: documents.id, url: documents.url })
    .from(documents)
    .where(
      and(
        eq(documents.sourceOrigin, 'federal_register'),
        or(isNull(documents.content), lt(sql`length(${documents.content})`, 400)),
      ),
    );

  console.log(`[backfill-content] fr: ${rows.length} Federal Register documents need content`);
  if (options.dryRun) return 0;

  const toProcess = options.limit ? rows.slice(0, options.limit) : rows;
  let updated = 0;

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      if (!row.url) continue;

      const docNumber = extractDocNumber(row.url);
      if (!docNumber) continue;

      const rawTextUrl = await fetchFrContentUrl(docNumber);
      if (!rawTextUrl) {
        await sleep(RATE_LIMIT_MS);
        continue;
      }

      const content = await fetchRawText(rawTextUrl);
      if (content) {
        await db
          .update(documents)
          .set({ content, embeddedAt: sql`NULL` })
          .where(eq(documents.id, row.id));
        updated++;
      }

      await sleep(RATE_LIMIT_MS);
    }

    console.log(
      `[backfill-content] fr: ${Math.min(i + BATCH_SIZE, toProcess.length)}/${toProcess.length} processed (${updated} updated)`,
    );
  }

  return updated;
}

async function backfillGovInfo(options: BackfillOptions): Promise<number> {
  const db = getDb();

  const rows = await db
    .select({ id: documents.id, metadata: documents.metadata })
    .from(documents)
    .where(and(eq(documents.sourceType, 'congressional_report'), isNull(documents.content)));

  console.log(`[backfill-content] govinfo: ${rows.length} Congressional Reports with null content`);
  if (options.dryRun) return 0;

  const toProcess = options.limit ? rows.slice(0, options.limit) : rows;
  let updated = 0;

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      const meta = row.metadata as Record<string, unknown> | null;
      const packageId = meta?.packageId as string | undefined;
      if (!packageId) continue;

      const content = await fetchGovInfoText(packageId);
      if (content) {
        await db
          .update(documents)
          .set({ content, embeddedAt: sql`NULL` })
          .where(eq(documents.id, row.id));
        updated++;
      }

      await sleep(RATE_LIMIT_MS);
    }

    console.log(
      `[backfill-content] govinfo: ${Math.min(i + BATCH_SIZE, toProcess.length)}/${toProcess.length} processed (${updated} updated)`,
    );
  }

  return updated;
}

/** Fetch content for a single OIG document based on its URL pattern. */
async function fetchOigContent(url: string): Promise<{ content: string | null; delayMs: number }> {
  // HHS OIG: scrape structured HTML detail page
  if (url.includes('oig.hhs.gov')) {
    const content = await fetchHhsOigReportContent(url);
    return { content, delayMs: HHS_OIG_CRAWL_DELAY_MS };
  }

  // SSA OIG: URL is already a PDF
  if (url.endsWith('.pdf')) {
    const content = await extractPdfText(url);
    return { content, delayMs: SSA_OIG_RATE_LIMIT_MS };
  }

  // DOJ OIG: scrape detail page for PDF link, then extract PDF
  if (url.includes('oig.justice.gov')) {
    const pdfUrl = await fetchDojOigPdfUrl(url);
    if (!pdfUrl) return { content: null, delayMs: DOJ_OIG_CRAWL_DELAY_MS };
    await sleep(DOJ_OIG_CRAWL_DELAY_MS);
    const content = await extractPdfText(pdfUrl);
    return { content, delayMs: DOJ_OIG_CRAWL_DELAY_MS };
  }

  return { content: null, delayMs: RATE_LIMIT_MS };
}

async function backfillOig(options: BackfillOptions): Promise<number> {
  const db = getDb();

  // OIG listing pages produce short metadata summaries (up to ~350 chars for multi-component DOJ reports).
  // Real report content is 1,000+ chars — use 400 as the threshold to catch all metadata-only docs.
  const rows = await db
    .select({ id: documents.id, url: documents.url, content: documents.content })
    .from(documents)
    .where(and(eq(documents.sourceOrigin, 'oig'), like(documents.sourceType, 'ig_report')));

  const needsContent = rows.filter((r) => r.url && (!r.content || r.content.length < 400));

  console.log(
    `[backfill-content] oig: ${needsContent.length}/${rows.length} IG reports need content`,
  );
  if (options.dryRun) return 0;

  const toProcess = options.limit ? needsContent.slice(0, options.limit) : needsContent;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    if (!row.url) continue;

    const { content, delayMs } = await fetchOigContent(row.url);
    if (content) {
      await db
        .update(documents)
        .set({ content, embeddedAt: sql`NULL` })
        .where(eq(documents.id, row.id));
      updated++;
    } else {
      failed++;
    }

    await sleep(delayMs);

    if ((i + 1) % BATCH_SIZE === 0 || i === toProcess.length - 1) {
      console.log(
        `[backfill-content] oig: ${i + 1}/${toProcess.length} processed (${updated} updated, ${failed} failed)`,
      );
    }
  }

  return updated;
}

async function backfillFec(options: BackfillOptions): Promise<number> {
  const db = getDb();

  // Old fetcher stored only respondent names or short API summaries (max ~266 chars).
  // Enriched content with dispositions/citations/PDF text is 500+ chars.
  const rows = await db
    .select({ id: documents.id, url: documents.url, content: documents.content })
    .from(documents)
    .where(and(eq(documents.sourceOrigin, 'fec')));

  const needsContent = rows.filter((r) => r.url && (!r.content || r.content.length < 400));

  console.log(
    `[backfill-content] fec: ${needsContent.length}/${rows.length} FEC documents need content enrichment`,
  );
  if (options.dryRun) return 0;

  const toProcess = options.limit ? needsContent.slice(0, options.limit) : needsContent;
  let updated = 0;
  let failed = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const row = toProcess[i];
    if (!row.url) continue;

    const content = await fetchFecEnrichedContent(row.url);
    if (content && content.length > (row.content?.length || 0)) {
      await db
        .update(documents)
        .set({ content, embeddedAt: sql`NULL` })
        .where(eq(documents.id, row.id));
      updated++;
    } else {
      failed++;
    }

    await sleep(FEC_RATE_LIMIT_MS);

    if ((i + 1) % BATCH_SIZE === 0 || i === toProcess.length - 1) {
      console.log(
        `[backfill-content] fec: ${i + 1}/${toProcess.length} processed (${updated} updated, ${failed} failed)`,
      );
    }
  }

  return updated;
}

interface DojApiRelease {
  title?: string;
  body?: string;
  teaser?: string;
  url?: string;
  component?: { uuid: string; name: string }[];
}

/** Minimal HTML tag stripper matching doj-fetcher. */
function stripHtmlBasic(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Fetch a single page from the DOJ API, returning releases and updated cookies. */
async function fetchDojApiPage(
  page: number,
  cookies: string,
): Promise<{ releases: DojApiRelease[]; cookies: string } | null> {
  const apiUrl = `${DOJ_API_BASE}?sort_order=DESC&pagesize=${DOJ_PAGE_SIZE}&page=${page}`;
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'User-Agent': 'DemocracyMonitor/1.0 (content-backfill)',
  };
  if (cookies) headers['Cookie'] = cookies;

  const response = await fetch(apiUrl, {
    headers,
    signal: AbortSignal.timeout(DOJ_FETCH_TIMEOUT_MS),
  });
  if (!response.ok) return null;

  const setCookie = response.headers.get('set-cookie');
  const newCookies = setCookie
    ? setCookie
        .split(',')
        .map((c) => c.split(';')[0].trim())
        .join('; ')
    : cookies;

  const data = await response.json();
  return { releases: data.results || [], cookies: newCookies };
}

/** Normalize a DOJ URL for comparison: resolve relative paths, strip trailing slashes, lowercase. */
function normalizeDojUrl(url: string): string {
  const fullUrl = url.startsWith('http') ? url : `https://www.justice.gov${url}`;
  return fullUrl.replace(/\/+$/, '').toLowerCase();
}

/**
 * Re-fetch DOJ press releases from the API and update short-content docs with full body.
 * Paginates through the DOJ API (DESC order), matching results to DB records by URL.
 */
async function backfillDoj(options: BackfillOptions): Promise<number> {
  const db = getDb();

  const rows = await db
    .select({ id: documents.id, url: documents.url, content: documents.content })
    .from(documents)
    .where(eq(documents.sourceOrigin, 'doj'));

  const needsContent = rows.filter(
    (r) => r.url && (!r.content || r.content.length < DOJ_SHORT_CONTENT_THRESHOLD),
  );

  console.log(
    `[backfill-content] doj: ${needsContent.length}/${rows.length} press releases need full body`,
  );
  if (options.dryRun || needsContent.length === 0) return 0;

  // Load ALL URLs into the lookup map — limit controls updates, not map size.
  // The API paginates chronologically, so limiting the map would miss matches.
  const urlToDoc = new Map<string, { id: number; contentLength: number }>();
  for (const row of needsContent) {
    if (row.url)
      urlToDoc.set(normalizeDojUrl(row.url), {
        id: row.id,
        contentLength: row.content?.length ?? 0,
      });
  }

  const maxUpdates = options.limit ?? Infinity;
  let updated = 0;
  let page = 0;
  let cookies = '';
  let pagesWithNoMatches = 0;

  while (urlToDoc.size > 0 && updated < maxUpdates) {
    let result: Awaited<ReturnType<typeof fetchDojApiPage>>;
    try {
      result = await fetchDojApiPage(page, cookies);
    } catch (err) {
      console.warn(`[backfill-content] doj: fetch error on page ${page}:`, err);
      break;
    }
    if (!result || result.releases.length === 0) break;
    cookies = result.cookies;

    let matchesThisPage = 0;
    for (const release of result.releases) {
      if (updated >= maxUpdates) break;
      if (!release.url) continue;
      const doc = urlToDoc.get(normalizeDojUrl(release.url));
      if (!doc) continue;
      const bodyText = release.body || release.teaser;
      if (!bodyText) continue;
      const content = truncateContent(stripHtmlBasic(bodyText));
      if (content.length <= doc.contentLength) continue;

      await db
        .update(documents)
        .set({ content, embeddedAt: sql`NULL` })
        .where(eq(documents.id, doc.id));
      updated++;
      matchesThisPage++;
      urlToDoc.delete(normalizeDojUrl(release.url));
    }

    pagesWithNoMatches = matchesThisPage === 0 ? pagesWithNoMatches + 1 : 0;
    if (pagesWithNoMatches >= 20) break;

    page++;
    if (page % 10 === 0) {
      console.log(
        `[backfill-content] doj: page ${page} (${updated} updated, ${urlToDoc.size} remaining)`,
      );
    }
    await sleep(DOJ_POLITENESS_DELAY_MS);
  }

  console.log(`[backfill-content] doj: done — ${updated} updated across ${page} pages`);
  return updated;
}

async function run(options: BackfillOptions): Promise<void> {
  if (!isDbAvailable()) {
    console.error('[backfill-content] DATABASE_URL not configured');
    process.exit(1);
  }

  let totalUpdated = 0;

  for (const source of options.sources) {
    if (source === 'fr') {
      totalUpdated += await backfillFr(options);
    } else if (source === 'govinfo') {
      totalUpdated += await backfillGovInfo(options);
    } else if (source === 'oig') {
      totalUpdated += await backfillOig(options);
    } else if (source === 'fec') {
      totalUpdated += await backfillFec(options);
    } else if (source === 'doj') {
      totalUpdated += await backfillDoj(options);
    }
  }

  if (options.dryRun) {
    console.log('[backfill-content] Dry run complete — no changes made');
  } else {
    console.log(`[backfill-content] Done — ${totalUpdated} documents updated`);
    if (totalUpdated > 0) {
      console.log(
        '[backfill-content] Run `pnpm embeddings:backfill` to re-embed updated documents',
      );
    }
  }
}

/* CLI entry */
if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm backfill:content [options]

Options:
  --source <name>     Source to backfill (fr, govinfo, oig, fec, doj; default: all)
  --limit <n>         Max documents to process
  --dry-run           Preview without writing to DB`,
  );
  const sourceIdx = args.indexOf('--source');
  const limitIdx = args.indexOf('--limit');
  const dryRun = args.includes('--dry-run');

  const sourceArg = sourceIdx !== -1 ? args[sourceIdx + 1] : undefined;
  const validSources: Source[] = ['fr', 'govinfo', 'oig', 'fec', 'doj'];
  const sources: Source[] =
    sourceArg && validSources.includes(sourceArg as Source) ? [sourceArg as Source] : validSources;

  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

  run({ sources, dryRun, limit: limit && !isNaN(limit) ? limit : null }).catch((err) => {
    console.error('[backfill-content] Fatal:', err);
    process.exit(1);
  });
}
