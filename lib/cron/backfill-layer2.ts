/**
 * Backfill Layer 2 AI assessments on historical data.
 *
 * Usage:
 *   pnpm layer2:backfill --baseline biden_2022 --pass 1
 *   pnpm layer2:backfill --baseline biden_2022 --pass 2
 *   pnpm layer2:backfill --from 2025-01-20 --to 2026-02-22 --category civilService
 *   pnpm layer2:backfill --source fec --fresh --confirm   # re-assess all FEC docs
 *   pnpm layer2:backfill --retry-p2                       # fast: retry only missing P2 assessments
 *   pnpm layer2:backfill --retry-p2 --category elections  # scoped to one category
 *   pnpm layer2:backfill --dry-run
 */
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { getAnalysisPeriods } from '@/lib/data/analysis-periods';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents, aiDocumentAssessments } from '@/lib/db/schema';
import type { Layer2Options } from '@/lib/services/layer2-orchestrator';
import { runLayer2Assessment, retryMissingPass2 } from '@/lib/services/layer2-orchestrator';
import { getPass1Count, findPass2GapWeeks } from '@/lib/services/layer2-store';
import type { ContentItem } from '@/lib/types';
import { checkHelp } from '@/lib/utils/cli-help';
import { addDays, getMonday } from '@/lib/utils/date-utils';

interface BackfillArgs {
  baseline?: string;
  from?: string;
  to?: string;
  category?: string;
  source?: string;
  pass?: number;
  dryRun: boolean;
  fresh: boolean;
  confirm: boolean;
  retryP2: boolean;
  verbose: boolean;
}

function parseArgs(): BackfillArgs {
  const args = process.argv.slice(2);
  const result: BackfillArgs = {
    dryRun: false,
    fresh: false,
    confirm: false,
    retryP2: false,
    verbose: false,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--baseline':
        result.baseline = args[++i];
        break;
      case '--from':
        result.from = args[++i];
        break;
      case '--to':
        result.to = args[++i];
        break;
      case '--category':
        result.category = args[++i];
        break;
      case '--source':
        result.source = args[++i];
        break;
      case '--pass':
        result.pass = parseInt(args[++i], 10);
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
      case '--fresh':
        result.fresh = true;
        break;
      case '--confirm':
        result.confirm = true;
        break;
      case '--retry-p2':
        result.retryP2 = true;
        break;
      case '--verbose':
        result.verbose = true;
        break;
    }
  }

  return result;
}

function resolveDateRanges(args: BackfillArgs): Array<{ from: string; to: string; label: string }> {
  if (args.baseline) {
    const config = BASELINE_CONFIGS.find((c) => c.id === args.baseline);
    if (!config) throw new Error(`Unknown baseline: ${args.baseline}`);
    return [{ from: config.from, to: config.to, label: config.id }];
  }
  if (args.from && args.to) return [{ from: args.from, to: args.to, label: 'custom' }];
  // Default: all analysis periods
  console.log(
    '[backfill-l2] No --baseline or --from/--to specified, defaulting to all analysis periods',
  );
  return getAnalysisPeriods();
}

async function getDocumentsForCategoryWeek(
  category: string,
  weekOf: string,
  source?: string,
): Promise<ContentItem[]> {
  const db = getDb();
  const weekEnd = addDays(weekOf, 7);

  const conditions = [
    eq(documents.category, category),
    gte(documents.publishedAt, new Date(weekOf)),
    lt(documents.publishedAt, new Date(weekEnd)),
    sql`${documents.contentType} != 'metadata_only'`,
    sql`length(${documents.content}) >= 100`,
  ];
  if (source) conditions.push(eq(documents.sourceOrigin, source));

  const rows = await db
    .select()
    .from(documents)
    .where(and(...conditions));

  return rows.map((row) => ({
    title: row.title,
    link: row.url ?? undefined,
    summary: row.content?.slice(0, 2000) ?? '',
    pubDate: row.publishedAt?.toISOString(),
    type: row.sourceType,
    agency: (row.metadata as Record<string, string>)?.agency,
  }));
}

function generateWeeks(from: string, to: string): string[] {
  const weeks: string[] = [];
  let current = getMonday(new Date(from));
  const endMs = new Date(to).getTime();

  while (new Date(current).getTime() < endMs) {
    weeks.push(current);
    current = addDays(current, 7);
  }

  return weeks;
}

export async function runBackfillLayer2(args: BackfillArgs): Promise<void> {
  if (!isDbAvailable()) throw new Error('Database not available');

  if (args.fresh) {
    if (!args.confirm) {
      console.error(
        '[backfill-l2] --fresh requires --confirm to delete ai_document_assessments. Aborting.',
      );
      return;
    }
    const db = getDb();
    const scopeLabels: string[] = [];
    if (args.source) scopeLabels.push(`source=${args.source}`);
    if (args.category) scopeLabels.push(`category=${args.category}`);

    if (scopeLabels.length > 0) {
      console.log(`[backfill-l2] --fresh: deleting assessments (${scopeLabels.join(', ')})...`);
      const docConditions = [
        args.source ? eq(documents.sourceOrigin, args.source) : undefined,
        args.category ? eq(documents.category, args.category) : undefined,
      ].filter(Boolean);
      const whereClause = docConditions.length === 1 ? docConditions[0] : and(...docConditions);
      await db.delete(aiDocumentAssessments).where(
        sql`${aiDocumentAssessments.documentId} IN (
          SELECT ${documents.id} FROM ${documents}
          WHERE ${whereClause}
        )`,
      );
      console.log(`[backfill-l2] Scoped assessments deleted.`);
    } else {
      console.log('[backfill-l2] --fresh: deleting all ai_document_assessments...');
      await db.delete(aiDocumentAssessments);
      console.log('[backfill-l2] All ai_document_assessments deleted.');
    }
  }

  const dateRanges = resolveDateRanges(args);
  const categories = args.category ? CATEGORIES.filter((c) => c.key === args.category) : CATEGORIES;

  if (categories.length === 0) throw new Error(`Unknown category: ${args.category}`);

  const options: Layer2Options = { dryRun: args.dryRun, verbose: args.verbose };
  let totalDocs = 0;
  let totalFlagged = 0;
  let skipped = 0;
  let p2Retried = 0;

  for (const range of dateRanges) {
    const weeks = generateWeeks(range.from, range.to);
    console.log(
      `\n[backfill-l2] === ${range.label} (${range.from} → ${range.to}) ===\n` +
        `[backfill-l2] ${categories.length} categories × ${weeks.length} weeks` +
        `${args.dryRun ? ' [DRY RUN]' : ''}`,
    );

    for (const cat of categories) {
      for (const weekOf of weeks) {
        const items = await getDocumentsForCategoryWeek(cat.key, weekOf, args.source);
        if (items.length === 0) continue;

        const existing = await getPass1Count(cat.key, weekOf, args.source);
        if (existing >= items.length) {
          skipped += items.length;
          p2Retried += await retryMissingPass2(cat.key, weekOf, options);
          continue;
        }

        console.log(`[backfill-l2] ${cat.key} / ${weekOf}: ${items.length} docs`);
        const summary = await runLayer2Assessment(items, cat.key, weekOf, options);

        if (summary) {
          totalDocs += summary.totalDocuments;
          totalFlagged += summary.flagCount;
        }
      }
    }
  }

  console.log(
    `\n[backfill-l2] Complete: ${totalDocs} docs assessed, ${totalFlagged} flagged` +
      (skipped > 0 ? `, ${skipped} skipped (already processed)` : '') +
      (p2Retried > 0 ? `, ${p2Retried} Pass 2 retried` : ''),
  );
}

async function runRetryP2(args: BackfillArgs): Promise<void> {
  if (!isDbAvailable()) throw new Error('Database not available');

  const dateRanges = resolveDateRanges(args);
  const options: Layer2Options = { dryRun: args.dryRun, verbose: args.verbose };
  let totalGaps = 0;
  let retried = 0;

  for (const range of dateRanges) {
    const gapWeeks = await findPass2GapWeeks(args.category, range.from, range.to);
    if (gapWeeks.length === 0) continue;

    const rangeGaps = gapWeeks.reduce((s, g) => s + g.gapCount, 0);
    totalGaps += rangeGaps;
    console.log(
      `[backfill-l2] ${range.label}: ${rangeGaps} P2 gaps across ${gapWeeks.length} category-weeks`,
    );

    for (const gap of gapWeeks) {
      retried += await retryMissingPass2(gap.category, gap.weekOf, options);
    }
  }

  if (totalGaps === 0) {
    console.log('[backfill-l2] No Pass 2 gaps found.');
  } else {
    console.log(
      `[backfill-l2] Retry complete: ${retried}/${totalGaps} Pass 2 assessments recovered`,
    );
  }
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv.slice(2),
    `Usage: pnpm layer2:backfill [options]

Options:
  --baseline <id>     Run for a specific baseline period (e.g. biden_2022)
  --from <date>       Start date (YYYY-MM-DD)
  --to <date>         End date (YYYY-MM-DD)
  --category <key>    Process a single category
  --source <origin>   Scope to a source_origin (e.g. fec, oig, cpd)
  --pass <n>          Run only pass 1 or 2
  --retry-p2          Fast retry of only missing Pass 2 assessments
  --dry-run           Preview without writing to DB
  --fresh --confirm   Delete assessments and re-run (scoped by --source or --category if set)
  --verbose           Show per-URL skip/failure details`,
  );
  const args = parseArgs();
  const run = args.retryP2 ? runRetryP2(args) : runBackfillLayer2(args);
  run
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[backfill-l2] Fatal error:', err);
      process.exit(1);
    });
}
