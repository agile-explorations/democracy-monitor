/**
 * Backfill Layer 2 AI assessments on historical data.
 *
 * Usage:
 *   pnpm layer2:backfill --baseline biden_2022 --pass 1
 *   pnpm layer2:backfill --baseline biden_2022 --pass 2
 *   pnpm layer2:backfill --from 2025-01-20 --to 2026-02-22 --category civilService
 *   pnpm layer2:backfill --dry-run
 */
import { and, eq, gte, lt, sql } from 'drizzle-orm';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents, aiDocumentAssessments } from '@/lib/db/schema';
import type { Layer2Options } from '@/lib/services/layer2-orchestrator';
import { runLayer2Assessment, retryMissingPass2 } from '@/lib/services/layer2-orchestrator';
import { getPass1Count } from '@/lib/services/layer2-store';
import type { ContentItem } from '@/lib/types';
import { addDays, getMonday } from '@/lib/utils/date-utils';

interface BackfillArgs {
  baseline?: string;
  from?: string;
  to?: string;
  category?: string;
  pass?: number;
  dryRun: boolean;
  fresh: boolean;
  confirm: boolean;
}

function parseArgs(): BackfillArgs {
  const args = process.argv.slice(2);
  const result: BackfillArgs = { dryRun: false, fresh: false, confirm: false };

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
    }
  }

  return result;
}

function resolveDateRange(args: BackfillArgs): { from: string; to: string } {
  if (args.baseline) {
    const config = BASELINE_CONFIGS.find((c) => c.id === args.baseline);
    if (!config) throw new Error(`Unknown baseline: ${args.baseline}`);
    return { from: config.from, to: config.to };
  }
  if (args.from && args.to) return { from: args.from, to: args.to };
  throw new Error('Provide --baseline or --from/--to');
}

async function getDocumentsForCategoryWeek(
  category: string,
  weekOf: string,
): Promise<ContentItem[]> {
  const db = getDb();
  const weekEnd = addDays(weekOf, 7);

  const rows = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.category, category),
        gte(documents.publishedAt, new Date(weekOf)),
        lt(documents.publishedAt, new Date(weekEnd)),
        sql`${documents.contentType} != 'metadata_only'`,
      ),
    );

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
        '[backfill-l2] --fresh requires --confirm to delete all ai_document_assessments. Aborting.',
      );
      return;
    }
    const db = getDb();
    console.log('[backfill-l2] --fresh: deleting all ai_document_assessments...');
    await db.delete(aiDocumentAssessments);
    console.log('[backfill-l2] All ai_document_assessments deleted.');
  }

  const { from, to } = resolveDateRange(args);
  const categories = args.category ? CATEGORIES.filter((c) => c.key === args.category) : CATEGORIES;

  if (categories.length === 0) throw new Error(`Unknown category: ${args.category}`);

  const weeks = generateWeeks(from, to);
  console.log(
    `[backfill-l2] ${categories.length} categories × ${weeks.length} weeks ` +
      `(${from} → ${to})${args.dryRun ? ' [DRY RUN]' : ''}`,
  );

  const options: Layer2Options = { dryRun: args.dryRun };
  let totalDocs = 0;
  let totalFlagged = 0;
  let skipped = 0;
  let p2Retried = 0;

  for (const cat of categories) {
    for (const weekOf of weeks) {
      const items = await getDocumentsForCategoryWeek(cat.key, weekOf);
      if (items.length === 0) continue;

      const existing = await getPass1Count(cat.key, weekOf);
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

  console.log(
    `[backfill-l2] Complete: ${totalDocs} docs assessed, ${totalFlagged} flagged` +
      (skipped > 0 ? `, ${skipped} skipped (already processed)` : '') +
      (p2Retried > 0 ? `, ${p2Retried} Pass 2 retried` : ''),
  );
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const args = parseArgs();
  runBackfillLayer2(args)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[backfill-l2] Fatal error:', err);
      process.exit(1);
    });
}
