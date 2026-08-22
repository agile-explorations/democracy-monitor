/**
 * GAO product backfill via Wayback (#739).
 *
 * Usage:
 *   pnpm backfill:gao [--dry-run] [--limit N] [--dateFrom D] [--dateTo D] [--baselines]
 *
 * Default range is the current term (2025-01-20 → today). Pre-T2 dates are
 * REJECTED unless --baselines is passed: baseline-period writes require
 * explicit owner approval per invocation (standing policy), and the flag is
 * the per-invocation acknowledgment.
 *
 * Dry-run enumerates (CDX only, no page fetches beyond 3 parse samples),
 * prints per-fiscal-year counts for the requested range PLUS baseline-year
 * counts (sizes Phase B), and writes nothing.
 *
 * Coverage-excluded I/O; parsing is unit-tested in gao-parsers.test.ts.
 */

import { and, eq, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { storeDocuments } from '@/lib/services/document-store';
import {
  enumerateGaoProducts,
  fetchGaoHistorical,
  fetchProducts,
  gaoIdPrefixesForRange,
} from '@/lib/services/gao-fetcher';
import type { GaoEnumerated } from '@/lib/services/gao-fetcher';
import { GAO_SOURCE_ORIGIN } from '@/lib/services/gao-parsers';
import { checkHelp } from '@/lib/utils/cli-help';

const T2_START = '2025-01-20';
const BASELINE_START = '2017-01-20';
const GAO_CATEGORY = 'executiveOversight';

interface GaoBackfillOptions {
  dryRun: boolean;
  limit?: number;
  dateFrom: string;
  dateTo: string;
  baselines: boolean;
}

async function existingGaoUrls(): Promise<Set<string>> {
  if (!isDbAvailable()) return new Set();
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const rows = await db
    .select({ url: documents.url })
    .from(documents)
    .where(
      and(eq(documents.sourceOrigin, GAO_SOURCE_ORIGIN), eq(documents.category, GAO_CATEGORY)),
    );
  return new Set(rows.map((r) => r.url).filter((u): u is string => !!u));
}

async function dryRun(opts: GaoBackfillOptions): Promise<void> {
  console.log(`[gao] DRY RUN — enumerating ${opts.dateFrom}..${opts.dateTo}`);
  const prefixes = gaoIdPrefixesForRange(opts.dateFrom, opts.dateTo);
  let total = 0;
  const sampleProducts: GaoEnumerated[] = [];
  for (const prefix of prefixes) {
    const products = await enumerateGaoProducts([prefix]);
    console.log(`  ${prefix}* -> ${products.length} products`);
    total += products.length;
    if (sampleProducts.length < 3)
      sampleProducts.push(...products.slice(0, 3 - sampleProducts.length));
  }
  console.log(`[gao] TOTAL enumerated: ${total}`);

  if (opts.dateFrom >= T2_START) {
    console.log('[gao] Phase B sizing — baseline-year CDX counts (no fetches):');
    for (const prefix of gaoIdPrefixesForRange(BASELINE_START, '2025-01-19')) {
      const products = await enumerateGaoProducts([prefix]);
      console.log(`  ${prefix}* -> ${products.length} products`);
    }
  }

  console.log('[gao] parse samples (verifies replay decode):');
  // Reuse the enumeration above — no extra CDX traffic for samples.
  const sampleItems = await fetchProducts(sampleProducts);
  for (const item of sampleItems) {
    console.log(
      `  ${item.link} | ${item.pubDate} | ${item.contentType} | ${item.content?.length ?? 0} chars | ${item.title?.slice(0, 80)}`,
    );
  }
}

async function run(opts: GaoBackfillOptions): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const skipUrls = await existingGaoUrls();
  console.log(
    `[gao] backfill ${opts.dateFrom}..${opts.dateTo} (${skipUrls.size} already stored, skipped)`,
  );
  const items = await fetchGaoHistorical({
    dateFrom: opts.dateFrom,
    dateTo: opts.dateTo,
    limit: opts.limit,
    skipUrls,
  });
  const stored = await storeDocuments(items, GAO_CATEGORY);
  const metadataOnly = items.filter((i) => i.contentType === 'metadata_only').length;
  console.log(
    `[gao] stored=${JSON.stringify(stored)} items=${items.length} metadata_only=${metadataOnly}`,
  );
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const count = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(documents)
    .where(eq(documents.sourceOrigin, GAO_SOURCE_ORIGIN));
  console.log(`[gao] total GAO rows now: ${count[0]?.n}`);
}

function parseArgs(): GaoBackfillOptions {
  const args = process.argv.slice(2);
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const opts: GaoBackfillOptions = {
    dryRun: args.includes('--dry-run'),
    limit: value('--limit') ? parseInt(value('--limit')!, 10) : undefined,
    dateFrom: value('--dateFrom') ?? T2_START,
    dateTo: value('--dateTo') ?? new Date().toISOString().slice(0, 10),
    baselines: args.includes('--baselines'),
  };
  if (opts.dateFrom < T2_START && !opts.baselines) {
    throw new Error(
      `dateFrom ${opts.dateFrom} predates ${T2_START}: baseline-period writes need explicit approval — pass --baselines to acknowledge (Phase B runbook, #739)`,
    );
  }
  if (opts.dateFrom < BASELINE_START) {
    throw new Error(`dateFrom ${opts.dateFrom} predates the ${BASELINE_START} baseline floor`);
  }
  return opts;
}

// CLI entry
if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv.slice(2),
    `Backfill GAO products from Wayback captures (#739)
Usage: pnpm backfill:gao [--dry-run] [--limit N] [--dateFrom D] [--dateTo D] [--baselines]
  --baselines   Required acknowledgment for any dateFrom before 2025-01-20`,
  );
  const opts = parseArgs();
  (opts.dryRun ? dryRun(opts) : run(opts))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[gao] failed:', err);
      process.exit(1);
    });
}
