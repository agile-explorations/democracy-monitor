/**
 * CLI: pnpm scores:backfill [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run]
 *
 * Repair pass for #559: finds stored documents with no document_scores row
 * (LegiScan bills and CL opinion-first docs were stored without scoring),
 * scores every affected category-week from stored docs, and re-aggregates
 * those weeks with the count-preserving upsert so documentCount and match
 * counts become accurate without touching enrichment (statuses, layer scores).
 *
 * Idempotent: storeDocumentScores upserts on (url, category); re-running
 * converges. Scoped to the 14 monitored categories — the `intent` pipeline
 * has its own aggregation and is never keyword-scored.
 */

import { sql } from 'drizzle-orm';
import { getDocumentsForCategoryWeek } from '@/lib/cron/backfill-document-review';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { scoreDocumentBatch, storeDocumentScores } from '@/lib/services/document-scorer';
import {
  computeWeeklyAggregate,
  getWeekOfDate,
  storeWeeklyAggregate,
} from '@/lib/services/weekly-aggregator';
import { checkHelp } from '@/lib/utils/cli-help';

interface BackfillScoresOptions {
  from: string;
  /** Inclusive publish-date ceiling; unbounded when omitted. */
  to?: string;
  dryRun: boolean;
}

/** Distinct (category, weekOf) pairs containing docs with no score row. */
async function findAffectedWeeks(
  from: string,
  to?: string,
): Promise<Array<{ category: string; weekOf: string }>> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const categoryKeys = CATEGORIES.map((c) => c.key);
  // Eligibility here MUST match the scorer's (#566): without the length
  // floor, weeks holding permanently-ineligible stubs re-surface as
  // "affected" on every run and get re-processed forever.
  const rows = await db.execute(sql`
    SELECT d.category, d.published_at
    FROM documents d
    LEFT JOIN document_scores s ON s.url = d.url AND s.category = d.category
    WHERE s.url IS NULL
      AND d.category IN (${sql.join(
        categoryKeys.map((k) => sql`${k}`),
        sql`, `,
      )})
      AND d.published_at >= ${from}
      AND (${to ?? null}::date IS NULL OR d.published_at < ${to ?? null}::date + 1)
      AND d.content_type != 'metadata_only'
      AND length(coalesce(d.content, '')) >= 100
      AND d.retrieval_relevant IS NOT FALSE
      AND d.counting_scope IS NOT FALSE
  `);

  const pairs = new Map<string, { category: string; weekOf: string }>();
  // db.execute returns raw driver values — published_at arrives as a string.
  for (const r of rows.rows as Array<{ category: string; published_at: string }>) {
    const weekOf = getWeekOfDate(r.published_at);
    pairs.set(`${r.category}|${weekOf}`, { category: r.category, weekOf });
  }
  return [...pairs.values()].sort((a, b) =>
    `${a.category}|${a.weekOf}`.localeCompare(`${b.category}|${b.weekOf}`),
  );
}

export async function runScoresBackfill(options: BackfillScoresOptions): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  if (options.from < '2025-01-20') {
    console.warn(
      '[backfill-scores] WARNING: range includes baseline periods (<2025-01-20) — ' +
        'baseline writes require explicit per-invocation approval',
    );
  }

  const affected = await findAffectedWeeks(options.from, options.to);
  console.log(`[backfill-scores] ${affected.length} category-weeks with unscored docs`);

  for (const { category, weekOf } of affected) {
    const stored = await getDocumentsForCategoryWeek(category, weekOf);
    if (stored.length === 0) {
      console.log(`  ${category} ${weekOf}: 0 eligible docs (all short/metadata-only), skipped`);
      continue;
    }
    if (options.dryRun) {
      console.log(`  ${category} ${weekOf}: would score ${stored.length} docs + re-aggregate`);
      continue;
    }
    await storeDocumentScores(scoreDocumentBatch(stored, category));
    const agg = await computeWeeklyAggregate(category, weekOf);
    await storeWeeklyAggregate(agg);
    console.log(
      `  ${category} ${weekOf}: scored ${stored.length} docs, re-aggregated (count=${agg.documentCount})`,
    );
  }

  console.log(`[backfill-scores] Complete${options.dryRun ? ' (dry run)' : ''}`);
}

function parseCliArgs(args: string[]): BackfillScoresOptions {
  const opts: BackfillScoresOptions = { from: '2025-01-20', dryRun: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from') opts.from = args[++i];
    else if (args[i] === '--to') opts.to = args[++i];
    else if (args[i] === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm scores:backfill [options]

Finds documents with no document_scores row, scores their category-weeks
from stored docs, and re-aggregates (count-preserving; enrichment untouched).

Options:
  --from <date>   Only consider docs published on/after this date (default 2025-01-20)
  --to <date>     Only consider docs published on/before this date (default unbounded)
  --dry-run       Report affected category-weeks without writing`,
  );
  const options = parseCliArgs(argv);
  runScoresBackfill(options).catch((err) => {
    console.error('[backfill-scores] Fatal:', err);
    process.exit(1);
  });
}
