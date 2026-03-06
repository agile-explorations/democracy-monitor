/**
 * CLI: pnpm backfill:content [--source fr|govinfo|wh] [--dry-run] [--limit N]
 *
 * Backfills null-content documents with full text:
 * - FR Presidential Documents: fetches raw_text_url from FR API, then raw text
 * - GovInfo Congressional Reports: fetches /packages/{id}/htm from GovInfo API
 * - WH (whitehouse.gov / trumpwhitehouse.archives.gov): scrapes article body
 *
 * Sets embedded_at = NULL on updated docs so `pnpm embeddings:backfill` re-embeds them.
 */

import { eq, isNull, and, sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { stripHtml } from '@/lib/parsers/feed-parser';
import { fetchGovInfoText } from '@/lib/services/govinfo-fetcher';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';

const BATCH_SIZE = 50;
const RATE_LIMIT_MS = 200;
const WH_RATE_LIMIT_MS = 500;
const MAX_CONTENT_LENGTH = 8_000;
const FR_FETCH_TIMEOUT_MS = 30_000;

type Source = 'fr' | 'govinfo' | 'wh';

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

async function fetchFrRawTextUrl(docNumber: string): Promise<string | null> {
  try {
    const url = `https://www.federalregister.gov/api/v1/documents/${docNumber}.json?fields[]=raw_text_url`;
    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DemocracyMonitor/1.0 (content-backfill)',
      },
      signal: AbortSignal.timeout(FR_FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.raw_text_url || null;
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

  const rows = await db
    .select({ id: documents.id, url: documents.url })
    .from(documents)
    .where(and(eq(documents.sourceType, 'Presidential Document'), isNull(documents.content)));

  console.log(`[backfill-content] fr: ${rows.length} Presidential Documents with null content`);
  if (options.dryRun) return 0;

  const toProcess = options.limit ? rows.slice(0, options.limit) : rows;
  let updated = 0;

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      if (!row.url) continue;

      const docNumber = extractDocNumber(row.url);
      if (!docNumber) continue;

      const rawTextUrl = await fetchFrRawTextUrl(docNumber);
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

/** CSS selectors to try for extracting article body from WH pages (priority order). */
const WH_BODY_SELECTORS = ['.page-content', '.entry-content', 'article', 'main'];

/**
 * Extract article body text from a WH HTML page.
 * Tries progressively broader CSS selectors; falls back to stripping all HTML.
 */
export function extractWhBody(html: string): string | null {
  for (const selector of WH_BODY_SELECTORS) {
    const inner = extractBySelector(html, selector);
    if (!inner) continue;
    const text = stripHtml(inner).replace(/\0/g, '').trim();
    if (text.length > 50) return truncateContent(text);
  }
  // Fallback: strip all HTML
  const text = stripHtml(html).replace(/\0/g, '').trim();
  return text.length > 50 ? truncateContent(text) : null;
}

/**
 * Extract inner HTML for a CSS selector, handling nested tags via depth counting.
 * Class selectors (`.foo`) match any div/section with that class.
 * Tag selectors (`article`) match the tag directly.
 */
function extractBySelector(html: string, selector: string): string | null {
  let openPattern: RegExp;
  let tagName: string;

  if (selector.startsWith('.')) {
    const className = selector.slice(1);
    openPattern = new RegExp(
      `<(div|section)[^>]*\\bclass=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>`,
      'i',
    );
    const openMatch = openPattern.exec(html);
    if (!openMatch) return null;
    tagName = openMatch[1].toLowerCase();
    return extractBalancedContent(html, tagName, openMatch.index + openMatch[0].length);
  }

  openPattern = new RegExp(`<${selector}[^>]*>`, 'i');
  const openMatch = openPattern.exec(html);
  if (!openMatch) return null;
  tagName = selector;
  return extractBalancedContent(html, tagName, openMatch.index + openMatch[0].length);
}

/** Find balanced closing tag by counting open/close depth from a start offset. */
function extractBalancedContent(html: string, tag: string, contentStart: number): string | null {
  const openRe = new RegExp(`<${tag}[\\s>]`, 'gi');
  const closeRe = new RegExp(`</${tag}\\s*>`, 'gi');
  const events: Array<{ pos: number; isOpen: boolean }> = [];

  openRe.lastIndex = contentStart;
  closeRe.lastIndex = contentStart;

  let m: RegExpExecArray | null;
  while ((m = openRe.exec(html))) events.push({ pos: m.index, isOpen: true });
  while ((m = closeRe.exec(html))) events.push({ pos: m.index, isOpen: false });
  events.sort((a, b) => a.pos - b.pos);

  let depth = 1;
  for (const ev of events) {
    depth += ev.isOpen ? 1 : -1;
    if (depth === 0) return html.slice(contentStart, ev.pos);
  }
  return null;
}

/** Archive domains for prior administration pages that 404 on current whitehouse.gov. */
const WH_ARCHIVE_HOSTS = ['trumpwhitehouse.archives.gov', 'bidenwhitehouse.archives.gov'];

async function fetchWhPageContent(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'DemocracyMonitor/1.0 (content-backfill)' },
      signal: AbortSignal.timeout(FR_FETCH_TIMEOUT_MS),
    });
    if (response.ok) {
      const html = await response.text();
      return extractWhBody(html);
    }
    // Fallback: try archive domains for whitehouse.gov 404s
    if (response.status === 404 && url.includes('www.whitehouse.gov')) {
      for (const archiveHost of WH_ARCHIVE_HOSTS) {
        const archiveUrl = url.replace('www.whitehouse.gov', archiveHost);
        const archiveRes = await fetch(archiveUrl, {
          headers: { 'User-Agent': 'DemocracyMonitor/1.0 (content-backfill)' },
          signal: AbortSignal.timeout(FR_FETCH_TIMEOUT_MS),
        });
        if (archiveRes.ok) {
          const html = await archiveRes.text();
          const content = extractWhBody(html);
          if (content) return content;
        }
      }
    }
    return null;
  } catch {
    return null;
  }
}

async function backfillWh(options: BackfillOptions): Promise<number> {
  const db = getDb();

  const rows = await db
    .select({ id: documents.id, url: documents.url })
    .from(documents)
    .where(and(eq(documents.sourceOrigin, 'whitehouse'), isNull(documents.content)));

  console.log(`[backfill-content] wh: ${rows.length} White House documents with null content`);
  if (options.dryRun) return 0;

  const toProcess = options.limit ? rows.slice(0, options.limit) : rows;
  let updated = 0;

  for (let i = 0; i < toProcess.length; i += BATCH_SIZE) {
    const batch = toProcess.slice(i, i + BATCH_SIZE);

    for (const row of batch) {
      if (!row.url) continue;

      const content = await fetchWhPageContent(row.url);
      if (content) {
        await db
          .update(documents)
          .set({ content, embeddedAt: sql`NULL` })
          .where(eq(documents.id, row.id));
        updated++;
      }

      await sleep(WH_RATE_LIMIT_MS);
    }

    console.log(
      `[backfill-content] wh: ${Math.min(i + BATCH_SIZE, toProcess.length)}/${toProcess.length} processed (${updated} updated)`,
    );
  }

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
    } else if (source === 'wh') {
      totalUpdated += await backfillWh(options);
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
  --source <name>     Source to backfill (fr, govinfo, wh; default: all)
  --limit <n>         Max documents to process
  --dry-run           Preview without writing to DB`,
  );
  const sourceIdx = args.indexOf('--source');
  const limitIdx = args.indexOf('--limit');
  const dryRun = args.includes('--dry-run');

  const sourceArg = sourceIdx !== -1 ? args[sourceIdx + 1] : undefined;
  const validSources: Source[] = ['fr', 'govinfo', 'wh'];
  const sources: Source[] =
    sourceArg && validSources.includes(sourceArg as Source)
      ? [sourceArg as Source]
      : ['fr', 'govinfo', 'wh'];

  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

  run({ sources, dryRun, limit: limit && !isNaN(limit) ? limit : null }).catch((err) => {
    console.error('[backfill-content] Fatal:', err);
    process.exit(1);
  });
}
