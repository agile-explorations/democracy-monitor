/**
 * CLI: pnpm embeddings:backfill [--category <key>] [--all-dates]
 *
 * Embeds documents that have no embedding yet, restricted to analysis periods by default.
 * Pass --all-dates to embed ALL unembedded documents regardless of date.
 */

import { buildAnalysisPeriodCondition, ALL_DATES_WARNING } from '@/lib/data/analysis-periods';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { embedUnprocessedDocuments } from '@/lib/services/document-embedder';
import { checkHelp } from '@/lib/utils/cli-help';

async function run(categoryFilter?: string, allDates?: boolean): Promise<void> {
  if (!isDbAvailable()) {
    console.error('[embed-missing] DATABASE_URL not configured');
    process.exit(1);
  }

  if (allDates) console.warn(ALL_DATES_WARNING);

  const categories = categoryFilter
    ? CATEGORIES.filter((c) => c.key === categoryFilter)
    : CATEGORIES;

  if (categories.length === 0) {
    console.error(`[embed-missing] Unknown category: ${categoryFilter}`);
    process.exit(1);
  }

  const dateFilter = allDates ? undefined : buildAnalysisPeriodCondition(documents.publishedAt);
  if (!allDates)
    console.log('[embed-missing] Restricting to analysis periods (use --all-dates to override)');

  let grandTotal = 0;

  for (const cat of categories) {
    const count = await embedUnprocessedDocuments(50, cat.key, dateFilter);
    if (count > 0) console.log(`  ${cat.key}: ${count} embedded`);
    grandTotal += count;
  }

  console.log(`[embed-missing] Done — ${grandTotal} documents embedded`);
}

/* CLI entry */
if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm embeddings:backfill [options]

Options:
  --category <key>    Process a single category
  --all-dates         Process all dates (default: analysis periods only)`,
  );
  const catIdx = args.indexOf('--category');
  const categoryFilter = catIdx !== -1 ? args[catIdx + 1] : undefined;
  const allDates = args.includes('--all-dates');

  run(categoryFilter, allDates).catch((err) => {
    console.error('[embed-missing] Fatal:', err);
    process.exit(1);
  });
}
