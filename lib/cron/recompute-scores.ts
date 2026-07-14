/**
 * CLI script to recompute document scores from existing documents in the database.
 * No API calls are made — this only reads from the documents table and writes to document_scores.
 *
 * Usage:
 *   pnpm scores:recompute                       # Recompute all + re-aggregate
 *   pnpm scores:recompute --category judicialIndependence  # Single category
 *   pnpm scores:recompute --from 2025-01-20      # Date range
 *   pnpm scores:recompute --dry-run              # Preview without writing
 */

import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import {
  getAnalysisPeriods,
  ALL_DATES_WARNING,
  buildActiveSourceCondition,
  ALL_SOURCES_WARNING,
} from '@/lib/data/analysis-periods';
import { getDb, isDbAvailable } from '@/lib/db';
import { retrievalRelevantOnly } from '@/lib/db/document-filters';
import { documents } from '@/lib/db/schema';
import { scoreDocument, storeDocumentScores } from '@/lib/services/document-scorer';
import { computeAllWeeklyAggregates, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { ContentItem } from '@/lib/types';
import type { DocumentScore } from '@/lib/types/scoring';
import { checkHelp } from '@/lib/utils/cli-help';

interface RecomputeOptions {
  category?: string;
  from?: string;
  to?: string;
  dryRun?: boolean;
  batchSize?: number;
  allDates?: boolean;
  allSources?: boolean;
}

type DocumentRow = typeof documents.$inferSelect;
type CategoryCounts = Record<string, { scored: number; nonZero: number }>;

function processDocumentBatch(
  rows: DocumentRow[],
  categoryCounts: CategoryCounts,
): DocumentScore[] {
  const scores: DocumentScore[] = [];

  for (const doc of rows) {
    const item: ContentItem = {
      title: doc.title,
      content: doc.content || undefined,
      link: doc.url || undefined,
      pubDate: doc.publishedAt?.toISOString(),
      agency:
        doc.metadata && typeof doc.metadata === 'object' && 'agency' in doc.metadata
          ? (doc.metadata as { agency?: string }).agency
          : undefined,
      type: doc.sourceType,
    };

    const score = scoreDocument(item, doc.category);
    if (!score) continue;
    score.documentId = doc.id;
    scores.push(score);

    if (!categoryCounts[doc.category]) {
      categoryCounts[doc.category] = { scored: 0, nonZero: 0 };
    }
    categoryCounts[doc.category].scored++;
    if (score.finalScore > 0) categoryCounts[doc.category].nonZero++;
  }

  return scores;
}

function logRecomputeSummary(
  totalScored: number,
  totalStored: number,
  categoryCounts: CategoryCounts,
  dryRun: boolean,
): void {
  console.log('');
  console.log('[recompute] === Summary ===');
  console.log(`  Total documents scored: ${totalScored}`);
  if (!dryRun) console.log(`  Total scores stored: ${totalStored}`);

  console.log('  Per category:');
  for (const [cat, counts] of Object.entries(categoryCounts).sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    console.log(`    ${cat}: ${counts.scored} scored, ${counts.nonZero} with non-zero score`);
  }
}

async function recomputeWeeklyAggregates(
  from?: string,
  to?: string,
  category?: string,
): Promise<void> {
  console.log('\n[recompute] Recomputing weekly aggregates...');
  const allAggs = await computeAllWeeklyAggregates({ from, to, category });
  let aggCount = 0;
  for (const [cat, aggs] of Object.entries(allAggs)) {
    for (const agg of aggs) {
      await storeWeeklyAggregate(agg);
      aggCount++;
    }
    console.log(`  ${cat}: ${aggs.length} weekly aggregates`);
  }
  console.log(`  Total weekly aggregates stored: ${aggCount}`);
}

function buildWhereClause(options: RecomputeOptions) {
  const conditions = [sql`${documents.contentType} != 'metadata_only'`, retrievalRelevantOnly()];
  if (options.category) conditions.push(eq(documents.category, options.category));
  if (options.from) conditions.push(gte(documents.publishedAt, new Date(options.from)));
  if (options.to) conditions.push(lte(documents.publishedAt, new Date(options.to)));
  if (!options.allSources) conditions.push(buildActiveSourceCondition(documents.sourceOrigin));
  return and(...conditions);
}

function logRecomputeStart(options: RecomputeOptions, dryRun: boolean): void {
  console.log(`[recompute] ${dryRun ? '(DRY RUN) ' : ''}Starting score recomputation...`);
  if (options.category) console.log(`[recompute] Category filter: ${options.category}`);
  if (options.from) console.log(`[recompute] From: ${options.from}`);
  if (options.to) console.log(`[recompute] To: ${options.to}`);
}

async function recomputeOnePeriod(
  options: RecomputeOptions,
  db: ReturnType<typeof getDb>,
  dryRun: boolean,
  batchSize: number,
): Promise<{ scored: number; stored: number; categoryCounts: CategoryCounts }> {
  const whereClause = buildWhereClause(options);
  let offset = 0;
  let totalScored = 0;
  let totalStored = 0;
  const categoryCounts: CategoryCounts = {};

  while (true) {
    const rows = await db
      .select()
      .from(documents)
      .where(whereClause)
      .orderBy(desc(documents.publishedAt), documents.id)
      .limit(batchSize)
      .offset(offset);

    if (rows.length === 0) break;

    const scores = processDocumentBatch(rows, categoryCounts);
    totalScored += scores.length;
    if (!dryRun) totalStored += await storeDocumentScores(scores);

    process.stdout.write(
      `\r[recompute] Processed ${totalScored} documents${dryRun ? ' (dry run)' : `, stored ${totalStored}`}`,
    );
    offset += batchSize;
  }

  return { scored: totalScored, stored: totalStored, categoryCounts };
}

export async function recomputeScores(options: RecomputeOptions): Promise<void> {
  if (!isDbAvailable()) {
    throw new Error('DATABASE_URL not configured');
  }

  const db = getDb(); // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig moved to CLI entry block for testability
  const dryRun = options.dryRun ?? false;
  const batchSize = options.batchSize ?? 500;
  const hasDateArgs = !!(options.from || options.to);
  const useAnalysisPeriods = !hasDateArgs && !options.allDates;

  if (options.allDates) console.warn(ALL_DATES_WARNING);
  if (options.allSources) console.warn(ALL_SOURCES_WARNING);
  if (!options.allSources)
    console.log('[recompute] Filtering to active sources (use --all-sources to override)');

  if (useAnalysisPeriods) {
    const periods = getAnalysisPeriods();
    console.log(`[recompute] Defaulting to ${periods.length} analysis periods`);
    const allCategoryCounts: CategoryCounts = {};
    let grandScored = 0;
    let grandStored = 0;

    for (const period of periods) {
      console.log(`\n[recompute] === ${period.label} (${period.from} → ${period.to}) ===`);
      const periodOptions = { ...options, from: period.from, to: period.to };
      logRecomputeStart(periodOptions, dryRun);
      const { scored, stored, categoryCounts } = await recomputeOnePeriod(
        periodOptions,
        db,
        dryRun,
        batchSize,
      );
      grandScored += scored;
      grandStored += stored;
      for (const [cat, counts] of Object.entries(categoryCounts)) {
        if (!allCategoryCounts[cat]) allCategoryCounts[cat] = { scored: 0, nonZero: 0 };
        allCategoryCounts[cat].scored += counts.scored;
        allCategoryCounts[cat].nonZero += counts.nonZero;
      }
      if (!dryRun) await recomputeWeeklyAggregates(period.from, period.to, options.category);
    }

    logRecomputeSummary(grandScored, grandStored, allCategoryCounts, dryRun);
  } else {
    logRecomputeStart(options, dryRun);
    const { scored, stored, categoryCounts } = await recomputeOnePeriod(
      options,
      db,
      dryRun,
      batchSize,
    );
    logRecomputeSummary(scored, stored, categoryCounts, dryRun);
    if (!dryRun) await recomputeWeeklyAggregates(options.from, options.to, options.category);
  }
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm scores:recompute [options]

Options:
  --category <key>    Process a single category
  --from <date>       Start date (YYYY-MM-DD)
  --to <date>         End date (YYYY-MM-DD)
  --batch-size <n>    Documents per batch (default: 500)
  --dry-run           Preview without writing to DB
  --all-dates         Process all dates (default: analysis periods only)
  --all-sources       Include all source origins (default: active sources only)`,
  );
  const options: RecomputeOptions = {};

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--category':
        options.category = args[++i];
        break;
      case '--from':
        options.from = args[++i];
        break;
      case '--to':
        options.to = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--batch-size':
        options.batchSize = parseInt(args[++i], 10);
        break;
      case '--all-dates':
        options.allDates = true;
        break;
      case '--all-sources':
        options.allSources = true;
        break;
    }
  }

  recomputeScores(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[recompute] Fatal error:', err);
      process.exit(1);
    });
}
