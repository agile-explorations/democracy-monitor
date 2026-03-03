/**
 * CLI: pnpm backfill:content [--source fr|govinfo] [--dry-run] [--limit N]
 *
 * Backfills null-content documents with full text:
 * - FR Presidential Documents: fetches raw_text_url from FR API, then raw text
 * - GovInfo Congressional Reports: fetches /packages/{id}/htm from GovInfo API
 *
 * Sets embedded_at = NULL on updated docs so `pnpm embed:missing` re-embeds them.
 */

import { eq, isNull, and, sql } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { stripHtml } from '@/lib/parsers/feed-parser';
import { fetchGovInfoText } from '@/lib/services/govinfo-fetcher';
import { sleep } from '@/lib/utils/async';

const BATCH_SIZE = 50;
const RATE_LIMIT_MS = 200;
const MAX_CONTENT_LENGTH = 8_000;
const FR_FETCH_TIMEOUT_MS = 30_000;

type Source = 'fr' | 'govinfo';

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
    }
  }

  if (options.dryRun) {
    console.log('[backfill-content] Dry run complete — no changes made');
  } else {
    console.log(`[backfill-content] Done — ${totalUpdated} documents updated`);
    if (totalUpdated > 0) {
      console.log('[backfill-content] Run `pnpm embed:missing` to re-embed updated documents');
    }
  }
}

/* CLI entry */
if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const args = process.argv.slice(2);
  const sourceIdx = args.indexOf('--source');
  const limitIdx = args.indexOf('--limit');
  const dryRun = args.includes('--dry-run');

  const sourceArg = sourceIdx !== -1 ? args[sourceIdx + 1] : undefined;
  const sources: Source[] =
    sourceArg === 'fr' || sourceArg === 'govinfo' ? [sourceArg] : ['fr', 'govinfo'];

  const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1], 10) : null;

  run({ sources, dryRun, limit: limit && !isNaN(limit) ? limit : null }).catch((err) => {
    console.error('[backfill-content] Fatal:', err);
    process.exit(1);
  });
}
