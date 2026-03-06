/**
 * CLI: pnpm embeddings:backfill [--category <key>] [--all-dates] [--all-sources]
 *
 * Embeds documents that have no embedding yet, restricted to analysis periods by default.
 * Pass --all-dates to embed ALL unembedded documents regardless of date.
 * Pass --all-sources to include excluded source origins (whitehouse, gdelt).
 */

import { and } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import {
  buildAnalysisPeriodCondition,
  ALL_DATES_WARNING,
  buildActiveSourceCondition,
  ALL_SOURCES_WARNING,
} from '@/lib/data/analysis-periods';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { embedUnprocessedDocuments } from '@/lib/services/document-embedder';
import { checkHelp } from '@/lib/utils/cli-help';

interface EmbedOptions {
  category?: string;
  allDates?: boolean;
  allSources?: boolean;
}

async function run(options: EmbedOptions): Promise<void> {
  if (!isDbAvailable()) {
    console.error('[embed-missing] DATABASE_URL not configured');
    process.exit(1);
  }

  if (options.allDates) console.warn(ALL_DATES_WARNING);
  if (options.allSources) console.warn(ALL_SOURCES_WARNING);

  const categories = options.category
    ? CATEGORIES.filter((c) => c.key === options.category)
    : CATEGORIES;

  if (categories.length === 0) {
    console.error(`[embed-missing] Unknown category: ${options.category}`);
    process.exit(1);
  }

  const conditions: SQL[] = [];
  if (!options.allDates) {
    conditions.push(buildAnalysisPeriodCondition(documents.publishedAt));
    console.log('[embed-missing] Restricting to analysis periods (use --all-dates to override)');
  }
  if (!options.allSources) {
    conditions.push(buildActiveSourceCondition(documents.sourceOrigin));
    console.log('[embed-missing] Filtering to active sources (use --all-sources to override)');
  }
  const extraFilter = conditions.length > 0 ? and(...conditions) : undefined;

  let grandTotal = 0;

  for (const cat of categories) {
    const count = await embedUnprocessedDocuments(50, cat.key, extraFilter);
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
  --all-dates         Process all dates (default: analysis periods only)
  --all-sources       Include all source origins (default: active sources only)`,
  );
  const catIdx = args.indexOf('--category');
  const embedOpts: EmbedOptions = {
    category: catIdx !== -1 ? args[catIdx + 1] : undefined,
    allDates: args.includes('--all-dates'),
    allSources: args.includes('--all-sources'),
  };

  run(embedOpts).catch((err) => {
    console.error('[embed-missing] Fatal:', err);
    process.exit(1);
  });
}
