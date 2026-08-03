/**
 * Backfill Layer 2 AI assessments on historical data.
 *
 * Usage:
 *   pnpm review:backfill --baseline biden_2022 --pass 1
 *   pnpm review:backfill --baseline biden_2022 --pass 2
 *   pnpm review:backfill --from 2025-01-20 --to 2026-02-22 --category civilService
 *   pnpm review:backfill --source fec --fresh --confirm   # re-assess all FEC docs
 *   pnpm review:backfill --retry-p2                       # fast: retry only missing P2 assessments
 *   pnpm review:backfill --retry-p2 --category elections  # scoped to one category
 *   pnpm review:backfill --dry-run
 */
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { getAnalysisPeriods } from '@/lib/data/analysis-periods';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { retrievalRelevantOnly } from '@/lib/db/document-filters';
import { documents, aiDocumentAssessments } from '@/lib/db/schema';
import {
  AiCallBudgetExceededError,
  configureAiCallBudget,
  getAiCallCount,
} from '@/lib/services/ai-call-budget';
import type { Layer2Options } from '@/lib/services/document-review-orchestrator';
import {
  runLayer2Assessment,
  retryMissingPass2,
} from '@/lib/services/document-review-orchestrator';
import { findPass2GapWeeks } from '@/lib/services/document-review-queries';
import { getExistingPass1Urls } from '@/lib/services/document-review-store';
import type { ContentItem } from '@/lib/types';
import { checkHelp } from '@/lib/utils/cli-help';
import { stripBoilerplate } from '@/lib/utils/content-cleaners';
import { addDays, getMonday } from '@/lib/utils/date-utils';

interface BackfillArgs {
  baseline?: string;
  from?: string;
  to?: string;
  category?: string;
  source?: string;
  pass?: number;
  maxCalls?: number;
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
      case '--max-calls': {
        const n = parseInt(args[++i], 10);
        if (!isNaN(n) && n > 0) result.maxCalls = n;
        break;
      }
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

export async function getDocumentsForCategoryWeek(
  category: string,
  weekOf: string,
  source?: string,
): Promise<ContentItem[]> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const weekEnd = addDays(weekOf, 7);

  const conditions = [
    eq(documents.category, category),
    gte(documents.publishedAt, new Date(weekOf)),
    lt(documents.publishedAt, new Date(weekEnd)),
    sql`${documents.contentType} != 'metadata_only'`,
    sql`length(${documents.content}) >= 100`,
    retrievalRelevantOnly(),
  ];
  if (source) conditions.push(eq(documents.sourceOrigin, source));

  const rows = await db
    .select()
    .from(documents)
    .where(and(...conditions));

  return rows.map((row) => ({
    title: row.title,
    link: row.url ?? undefined,
    content: stripBoilerplate(row.content ?? '', row.sourceOrigin, row.title).slice(0, 16000),
    pubDate: row.publishedAt?.toISOString(),
    type: row.sourceType,
    agency: (row.metadata as Record<string, string>)?.agency,
    // Carry the stored counting-scope so the scorer trusts it instead of
    // re-classifying the truncated content above (#667).
    countingScope: row.countingScope,
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
    // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
    const db = getDb();
    const scopeLabels: string[] = [];
    if (args.source) scopeLabels.push(`source=${args.source}`);
    if (args.category) scopeLabels.push(`category=${args.category}`);

    if (scopeLabels.length > 0) {
      console.log(`[backfill-l2] --fresh: deleting assessments (${scopeLabels.join(', ')})...`);
      // Delete by category/url columns on ai_document_assessments directly.
      // Cannot use document_id — it's NULL for all rows (known schema issue).
      const conditions = [];
      if (args.category) conditions.push(eq(aiDocumentAssessments.category, args.category));
      if (args.source) {
        conditions.push(
          sql`${aiDocumentAssessments.url} IN (
            SELECT ${documents.url} FROM ${documents}
            WHERE ${eq(documents.sourceOrigin, args.source)}
              ${args.category ? sql`AND ${eq(documents.category, args.category)}` : sql``}
          )`,
        );
      }
      const result = await db
        .delete(aiDocumentAssessments)
        .where(conditions.length === 1 ? conditions[0]! : and(...conditions));
      const deleted = (result as unknown as { rowCount?: number })?.rowCount ?? 'unknown';
      console.log(`[backfill-l2] Scoped assessments deleted (${deleted} rows).`);
    } else {
      console.log('[backfill-l2] --fresh: deleting all ai_document_assessments...');
      await db.delete(aiDocumentAssessments);
      console.log('[backfill-l2] All ai_document_assessments deleted.');
    }
  }

  const dateRanges = resolveDateRanges(args);
  const categories = args.category ? CATEGORIES.filter((c) => c.key === args.category) : CATEGORIES;

  if (categories.length === 0) throw new Error(`Unknown category: ${args.category}`);

  // #563: --pass was parsed but never wired — "--pass 1" ran the full P1+P2
  // pipeline and "--pass 2" ran it all again.
  const passFilter = args.pass === 1 || args.pass === 2 ? (args.pass as 1 | 2) : undefined;
  const options: Layer2Options = { dryRun: args.dryRun, verbose: args.verbose, passFilter };
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

        // Skip only when every item URL already has a P1 row for this category.
        // A count comparison (getPass1Count >= items.length) is NOT equivalent:
        // stale assessment rows (docs that no longer pass the loader filter, or
        // rows under other week_of anchors) inflate the count and silently skip
        // weeks that still contain unassessed docs — 94 court-query docs were
        // permanently stuck this way (#528).
        const itemUrls = items.map((i) => i.link || i.title).filter(Boolean) as string[];
        const existingUrls = await getExistingPass1Urls(itemUrls, '', cat.key);
        if (itemUrls.every((u) => existingUrls.has(u))) {
          skipped += items.length;
          // P2 gap-fill is P2 work — skip it on a P1-only run (#563).
          if (passFilter !== 1) p2Retried += await retryMissingPass2(cat.key, weekOf, options);
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
  await reportRemainingP2Gaps(args.category);
}

/**
 * The processed-week cache hides P2 gaps from normal-mode runs (#612): a week
 * whose P2 calls failed still reads as done. Always end with the authoritative
 * gap count so silence can't masquerade as completeness.
 */
async function reportRemainingP2Gaps(category?: string): Promise<void> {
  const gapWeeks = await findPass2GapWeeks(category);
  const gaps = gapWeeks.reduce((s, g) => s + g.gapCount, 0);
  if (gaps > 0) {
    console.warn(
      `[backfill-l2] ${gaps} P2 gaps remain across ${gapWeeks.length} ` +
        `category-weeks — run with --retry-p2 to address them`,
    );
  }
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
    `Usage: pnpm review:backfill [options]

Options:
  --baseline <id>     Run for a specific baseline period (e.g. biden_2022)
  --from <date>       Start date (YYYY-MM-DD)
  --to <date>         End date (YYYY-MM-DD)
  --category <key>    Process a single category
  --source <origin>   Scope to a source_origin (e.g. fec, oig, cpd)
  --pass <n>          Run only pass 1 or 2
  --max-calls <n>     Hard AI-call budget: exits 3 when reached (#564).
                      Set from the runbook precheck estimate x safety factor.
  --retry-p2          Fast retry of only missing Pass 2 assessments
  --dry-run           Preview without writing to DB
  --fresh --confirm   Delete assessments and re-run (scoped by --source or --category if set)
  --verbose           Show per-URL skip/failure details`,
  );
  const args = parseArgs();
  configureAiCallBudget(args.maxCalls ?? null);
  const run = args.retryP2 ? runRetryP2(args) : runBackfillLayer2(args);
  run
    .then(() => process.exit(0))
    .catch((err) => {
      if (err instanceof AiCallBudgetExceededError) {
        // Distinct exit code: chain scripts must NOT retry a budget stop —
        // the estimate is wrong and a human reviews before resuming (#564).
        console.error(`[backfill-l2] ${err.message}`);
        console.error(`[backfill-l2] AI calls this run: ${getAiCallCount()}. Exiting 3.`);
        process.exit(3);
      }
      console.error('[backfill-l2] Fatal error:', err);
      process.exit(1);
    });
}
