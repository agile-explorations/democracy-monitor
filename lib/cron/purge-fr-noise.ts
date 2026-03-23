/**
 * Purge Federal Register noise documents from specified categories.
 *
 * Deletes all FR-sourced documents and derived data (scores, assessments,
 * aggregates, baselines, narratives) for a category, then clears fetch_log
 * so re-backfill can start fresh.
 *
 * Usage:
 *   pnpm fr:purge-noise                          # Analyze ALL categories (dry run)
 *   pnpm fr:purge-noise --category civilService   # Single category
 *   pnpm fr:purge-noise --confirm                # Actually delete
 */

import { sql } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';

interface CategoryAnalysis {
  category: string;
  totalFrDocs: number;
  totalDocs: number;
}

interface PurgeResult {
  category: string;
  deletedAssessments: number;
  deletedScores: number;
  deletedP2025Matches: number;
  deletedDocuments: number;
  deletedAggregates: number;
  deletedBaselines: number;
  deletedNarratives: number;
  clearedFetchLog: number;
}

async function analyzeCategory(category: string): Promise<CategoryAnalysis> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  const frResult = await db.execute(sql`
    SELECT count(*) as count FROM documents
    WHERE source_origin = 'federal_register' AND category = ${category}
  `);
  const totalFrDocs = Number(frResult.rows[0]?.count ?? 0);

  const totalResult = await db.execute(sql`
    SELECT count(*) as count FROM documents
    WHERE category = ${category}
  `);
  const totalDocs = Number(totalResult.rows[0]?.count ?? 0);

  return { category, totalFrDocs, totalDocs };
}

async function purgeCategory(category: string): Promise<PurgeResult> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  // Deletion order respects FK constraints

  // 1. ai_document_assessments (references documents.id)
  const assessResult = await db.execute(sql`
    DELETE FROM ai_document_assessments
    WHERE document_id IN (
      SELECT id FROM documents
      WHERE source_origin = 'federal_register' AND category = ${category}
    )
  `);

  // 2. document_scores (references documents.url + category)
  const scoreResult = await db.execute(sql`
    DELETE FROM document_scores
    WHERE url IN (
      SELECT url FROM documents
      WHERE source_origin = 'federal_register' AND category = ${category}
    )
    AND category = ${category}
  `);

  // 3. p2025_matches (references documents.id)
  const p2025Result = await db.execute(sql`
    DELETE FROM p2025_matches
    WHERE document_id IN (
      SELECT id FROM documents
      WHERE source_origin = 'federal_register' AND category = ${category}
    )
  `);

  // 4. documents
  const docResult = await db.execute(sql`
    DELETE FROM documents
    WHERE source_origin = 'federal_register' AND category = ${category}
  `);

  // 5. weekly_aggregates (category-level, not per-document)
  const aggResult = await db.execute(sql`
    DELETE FROM weekly_aggregates WHERE category = ${category}
  `);

  // 6. baselines (category-level)
  const baselineResult = await db.execute(sql`
    DELETE FROM baselines WHERE category = ${category}
  `);

  // 7. narratives (category-level)
  const narrativeResult = await db.execute(sql`
    DELETE FROM narratives WHERE category = ${category}
  `);

  // 8. fetch_log (clear FR entries so re-backfill works)
  const fetchLogResult = await db.execute(sql`
    DELETE FROM fetch_log
    WHERE source_origin = 'federal_register' AND category = ${category}
  `);

  return {
    category,
    deletedAssessments: Number(assessResult.rowCount ?? 0),
    deletedScores: Number(scoreResult.rowCount ?? 0),
    deletedP2025Matches: Number(p2025Result.rowCount ?? 0),
    deletedDocuments: Number(docResult.rowCount ?? 0),
    deletedAggregates: Number(aggResult.rowCount ?? 0),
    deletedBaselines: Number(baselineResult.rowCount ?? 0),
    deletedNarratives: Number(narrativeResult.rowCount ?? 0),
    clearedFetchLog: Number(fetchLogResult.rowCount ?? 0),
  };
}

async function run(categoryFilter: string | undefined, confirm: boolean): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');

  const validKeys = new Set(CATEGORIES.map((c) => c.key));
  const targetCategories = categoryFilter ? [categoryFilter] : [...validKeys];

  if (categoryFilter && !validKeys.has(categoryFilter)) {
    throw new Error(`Unknown category: ${categoryFilter}. Valid: ${[...validKeys].join(', ')}`);
  }

  console.log('[fr:purge-noise] Analyzing FR documents...\n');

  for (const category of targetCategories) {
    const analysis = await analyzeCategory(category);
    if (analysis.totalFrDocs === 0) continue;

    const pct =
      analysis.totalDocs > 0 ? ((analysis.totalFrDocs / analysis.totalDocs) * 100).toFixed(1) : '0';
    console.log(
      `  ${category}: ${analysis.totalFrDocs} FR docs / ${analysis.totalDocs} total (${pct}%)`,
    );
  }

  if (!confirm) {
    console.log('\n[fr:purge-noise] Dry run complete. Run with --confirm to delete.');
    return;
  }

  console.log('\n[fr:purge-noise] Purging FR documents and derived data...\n');

  for (const category of targetCategories) {
    const analysis = await analyzeCategory(category);
    if (analysis.totalFrDocs === 0) {
      console.log(`  ${category}: no FR docs, skipping`);
      continue;
    }

    const result = await purgeCategory(category);
    console.log(`  ${category}:`);
    console.log(`    Documents deleted:      ${result.deletedDocuments}`);
    console.log(`    AI assessments deleted:  ${result.deletedAssessments}`);
    console.log(`    Scores deleted:          ${result.deletedScores}`);
    console.log(`    P2025 matches deleted:   ${result.deletedP2025Matches}`);
    console.log(`    Aggregates deleted:      ${result.deletedAggregates}`);
    console.log(`    Baselines deleted:       ${result.deletedBaselines}`);
    console.log(`    Narratives deleted:      ${result.deletedNarratives}`);
    console.log(`    Fetch log cleared:       ${result.clearedFetchLog}`);
  }

  const cats = categoryFilter ? categoryFilter : 'ALL_CATEGORIES';
  console.log('\n[fr:purge-noise] === Purge Complete ===');
  console.log('\nNext steps (per category):');
  console.log(`  pnpm backfill --category ${cats} --source fr --force`);
  console.log(`  pnpm scores:recompute --category ${cats}`);
  console.log(`  pnpm review:backfill --category ${cats}`);
  console.log('  pnpm baselines:compute');
  console.log(`  pnpm validate:ingest --category ${cats}`);
  console.log(`  pnpm validate:data --category ${cats}`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm fr:purge-noise [options]

Options:
  --category <key>    Purge a single category (default: all)
  --confirm           Actually delete (default: dry run / analysis only)`,
  );

  const catIdx = args.indexOf('--category');
  const categoryFilter = catIdx >= 0 ? args[catIdx + 1] : undefined;
  const confirm = args.includes('--confirm');

  run(categoryFilter, confirm)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[fr:purge-noise] Fatal error:', err);
      process.exit(1);
    });
}
