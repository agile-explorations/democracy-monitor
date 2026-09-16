/**
 * CLI: pnpm embeddings:backfill [--category <key>] [--all-dates] [--all-sources]
 *                               [--dry-run] [--max-docs N]
 *
 * Embeds documents that have no embedding yet, restricted to analysis periods by default.
 * Pass --all-dates to embed ALL unembedded documents regardless of date.
 * Pass --all-sources to include excluded source origins (whitehouse, gdelt).
 * Pass --dry-run to print the embeddable count and an approximate token
 * estimate under the embedder's own predicate, without calling the API.
 * Pass --max-docs N to stop after N documents are attempted — exits 3 when
 * the cap trips, and chain scripts must NOT retry that exit (AI spend
 * protocol, #563/#564).
 */

import { and, gte, lte } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import {
  buildAnalysisPeriodCondition,
  ALL_DATES_WARNING,
  buildActiveSourceCondition,
  ALL_SOURCES_WARNING,
} from '@/lib/data/analysis-periods';
import { CATEGORIES } from '@/lib/data/categories';
import { CORPUS_CATEGORY } from '@/lib/data/document-populations';
import { isDbAvailable } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { countEmbeddable, embedWithCap } from '@/lib/services/document-embedder';
import { checkHelp } from '@/lib/utils/cli-help';

/** Distinct exit code for a tripped spend cap (#564): chain scripts must not retry it. */
const EXIT_CAP_TRIPPED = 3;

interface EmbedOptions {
  category?: string;
  from?: string;
  to?: string;
  allDates?: boolean;
  allSources?: boolean;
  dryRun?: boolean;
  maxDocs?: number;
}

function buildExtraFilter(options: EmbedOptions): SQL | undefined {
  const conditions: SQL[] = [];
  if (options.from || options.to) {
    if (options.from) conditions.push(gte(documents.publishedAt, new Date(options.from)));
    if (options.to) conditions.push(lte(documents.publishedAt, new Date(options.to)));
    console.log(`[embed-missing] Date range: ${options.from ?? '*'} → ${options.to ?? '*'}`);
  } else if (!options.allDates) {
    conditions.push(buildAnalysisPeriodCondition(documents.publishedAt));
    console.log(
      '[embed-missing] Restricting to analysis periods (use --all-dates or --from/--to to override)',
    );
  }
  if (!options.allSources) {
    conditions.push(buildActiveSourceCondition(documents.sourceOrigin));
    console.log('[embed-missing] Filtering to active sources (use --all-sources to override)');
  }
  return conditions.length > 0 ? and(...conditions) : undefined;
}

/** Detection categories (+ the corpus pseudo-category on unscoped runs), or
 *  the one named category — `corpus` is a valid name so restored rows can be
 *  embedded under their own spend cap. Empty = unknown name. */
export function resolveCategoryKeys(category?: string): string[] {
  if (!category) return [...CATEGORIES.map((c) => c.key), CORPUS_CATEGORY];
  if (category === CORPUS_CATEGORY) return [CORPUS_CATEGORY];
  return CATEGORIES.filter((c) => c.key === category).map((c) => c.key);
}

async function printDryRun(categoryKeys: string[], extraFilter: SQL | undefined): Promise<void> {
  let count = 0;
  let approxTokens = 0;
  for (const key of categoryKeys) {
    const estimate = await countEmbeddable({ category: key, dateFilter: extraFilter });
    if (estimate.count > 0) {
      console.log(`  ${key}: ${estimate.count} embeddable (~${estimate.approxTokens} tokens)`);
    }
    count += estimate.count;
    approxTokens += estimate.approxTokens;
  }
  console.log(
    `[embed-missing] Dry run — ${count} embeddable documents, ~${approxTokens} tokens (approximate: min(length, 20000)/4 per doc). No API calls made.`,
  );
}

async function run(options: EmbedOptions): Promise<void> {
  if (!isDbAvailable()) {
    console.error('[embed-missing] DATABASE_URL not configured');
    process.exit(1);
  }

  if (options.allDates) console.warn(ALL_DATES_WARNING);
  if (options.allSources) console.warn(ALL_SOURCES_WARNING);

  const categoryKeys = resolveCategoryKeys(options.category);
  if (categoryKeys.length === 0) {
    console.error(`[embed-missing] Unknown category: ${options.category}`);
    process.exit(1);
  }

  const extraFilter = buildExtraFilter(options);

  if (options.dryRun) {
    await printDryRun(categoryKeys, extraFilter);
    return;
  }

  if (options.maxDocs !== undefined) {
    console.log(`[embed-missing] Cap: stopping after ${options.maxDocs} attempted documents`);
  }

  let grandTotal = 0;
  let attempted = 0;

  for (const key of categoryKeys) {
    const remaining = options.maxDocs === undefined ? undefined : options.maxDocs - attempted;
    if (remaining !== undefined && remaining <= 0) break;
    const outcome = await embedWithCap(key, extraFilter, remaining);
    if (outcome.embedded > 0) console.log(`  ${key}: ${outcome.embedded} embedded`);
    grandTotal += outcome.embedded;
    attempted += outcome.attempted;
  }

  console.log(`[embed-missing] Done — ${grandTotal} documents embedded (${attempted} attempted)`);

  if (options.maxDocs !== undefined && attempted >= options.maxDocs) {
    // Exit 3 means "cut off with work remaining" — a run that ended exactly
    // at the cap with nothing left is a completed run, not a tripped one.
    const left = await countEmbeddable({ dateFilter: extraFilter });
    if (left.count === 0) {
      console.log(`[embed-missing] Cap reached with no embeddable documents left — complete.`);
      return;
    }
    console.error(
      `[embed-missing] --max-docs ${options.maxDocs} reached with ${left.count} embeddable left. Exiting ${EXIT_CAP_TRIPPED}: review the estimate before resuming (#564).`,
    );
    process.exit(EXIT_CAP_TRIPPED);
  }
}

function parseMaxDocs(args: string[]): number | undefined {
  const idx = args.indexOf('--max-docs');
  if (idx === -1) return undefined;
  const value = Number(args[idx + 1]);
  if (!Number.isInteger(value) || value <= 0) {
    console.error(`[embed-missing] --max-docs expects a positive integer, got: ${args[idx + 1]}`);
    process.exit(1);
  }
  return value;
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
  --from <date>       Start date (YYYY-MM-DD)
  --to <date>         End date (YYYY-MM-DD)
  --all-dates         Process all dates (default: analysis periods only)
  --all-sources       Include all source origins (default: active sources only)
  --dry-run           Print the embeddable count + approximate token estimate; no API calls
  --max-docs <n>      Stop after n documents are attempted; exits 3 when the cap trips (#564)`,
  );
  const catIdx = args.indexOf('--category');
  const fromIdx = args.indexOf('--from');
  const toIdx = args.indexOf('--to');
  const embedOpts: EmbedOptions = {
    category: catIdx !== -1 ? args[catIdx + 1] : undefined,
    from: fromIdx !== -1 ? args[fromIdx + 1] : undefined,
    to: toIdx !== -1 ? args[toIdx + 1] : undefined,
    allDates: args.includes('--all-dates'),
    allSources: args.includes('--all-sources'),
    dryRun: args.includes('--dry-run'),
    maxDocs: parseMaxDocs(args),
  };

  run(embedOpts).catch((err) => {
    console.error('[embed-missing] Fatal:', err);
    process.exit(1);
  });
}
