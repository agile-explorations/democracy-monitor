/**
 * Purge all LegiScan documents classified with old ASSESSMENT_RULES keywords.
 *
 * Background: classifyLegislativeRelevance() used ASSESSMENT_RULES (erosion-detection
 * keywords) instead of TOPIC_ROUTING_TERMS (topic-routing terms) for bill classification.
 * This produced ~1,826 misclassified docs across 11 categories. The classification logic
 * has been fixed; this script deletes old data so it can be re-backfilled with correct routing.
 *
 * Usage:
 *   pnpm legiscan:purge-noise              # Analyze only (dry run)
 *   pnpm legiscan:purge-noise --confirm    # Delete all LegiScan data + clear tracking table
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';

interface CategoryCount {
  category: string;
  count: number;
}

interface PurgeResult {
  deletedDocuments: number;
  deletedScores: number;
  deletedAssessments: number;
  deletedP2025Matches: number;
  clearedDatasets: number;
}

async function analyze(): Promise<{ total: number; byCategory: CategoryCount[] }> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  const totalResult = await db.execute(sql`
    SELECT count(*) as count FROM documents WHERE source_origin = 'legiscan'
  `);
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const byCategoryResult = await db.execute(sql`
    SELECT category, count(*) as count FROM documents
    WHERE source_origin = 'legiscan'
    GROUP BY category ORDER BY count DESC
  `);

  const byCategory: CategoryCount[] = byCategoryResult.rows.map((r) => ({
    category: String(r.category ?? '(null)'),
    count: Number(r.count),
  }));

  return { total, byCategory };
}

async function purge(): Promise<PurgeResult> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  const noiseIds = sql`SELECT id FROM documents WHERE source_origin = 'legiscan'`;
  const noiseUrls = sql`SELECT url FROM documents WHERE source_origin = 'legiscan'`;

  // Delete from ai_document_assessments (references documents.id)
  const assessResult = await db.execute(sql`
    DELETE FROM ai_document_assessments WHERE document_id IN (${noiseIds})
  `);

  // Delete from document_scores (references documents.url)
  const scoreResult = await db.execute(sql`
    DELETE FROM document_scores WHERE url IN (${noiseUrls})
  `);

  // Delete from p2025_matches (references documents.id)
  const p2025Result = await db.execute(sql`
    DELETE FROM p2025_matches WHERE document_id IN (${noiseIds})
  `);

  // Delete all LegiScan documents
  const docResult = await db.execute(sql`
    DELETE FROM documents WHERE source_origin = 'legiscan'
  `);

  // Clear legiscan_datasets tracking table to force re-download
  const datasetResult = await db.execute(sql`
    DELETE FROM legiscan_datasets
  `);

  return {
    deletedDocuments: Number(docResult.rowCount ?? 0),
    deletedScores: Number(scoreResult.rowCount ?? 0),
    deletedAssessments: Number(assessResult.rowCount ?? 0),
    deletedP2025Matches: Number(p2025Result.rowCount ?? 0),
    clearedDatasets: Number(datasetResult.rowCount ?? 0),
  };
}

async function run(confirm: boolean): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');

  console.log('[purge-legiscan] Analyzing LegiScan documents...\n');
  const { total, byCategory } = await analyze();

  console.log(`  Total LegiScan docs: ${total}`);

  if (byCategory.length > 0) {
    console.log('\n  Per-category distribution:');
    for (const { category, count } of byCategory) {
      console.log(`    ${count.toString().padStart(6)} — ${category}`);
    }
  }

  if (total === 0) {
    console.log('\n[purge-legiscan] No LegiScan documents found. Nothing to do.');
    return;
  }

  if (!confirm) {
    console.log('\n[purge-legiscan] Dry run complete. Run with --confirm to delete.');
    return;
  }

  console.log('\n[purge-legiscan] Purging all LegiScan data...');
  const result = await purge();

  console.log('\n[purge-legiscan] === Purge Complete ===');
  console.log(`  Documents deleted:      ${result.deletedDocuments}`);
  console.log(`  Scores deleted:         ${result.deletedScores}`);
  console.log(`  AI assessments deleted: ${result.deletedAssessments}`);
  console.log(`  P2025 matches deleted:  ${result.deletedP2025Matches}`);
  console.log(`  Dataset entries cleared: ${result.clearedDatasets}`);
  console.log('\n[purge-legiscan] Next steps:');
  console.log('  1. pnpm legiscan:bulk');
  console.log('  2. pnpm scores:recompute');
  console.log('  3. pnpm embeddings:backfill');
  console.log('  4. pnpm review:backfill');
  console.log('  5. pnpm baselines:compute');
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm legiscan:purge-noise [options]

Options:
  --confirm           Actually delete (default: dry run / analysis only)`,
  );
  const confirm = args.includes('--confirm');
  run(confirm)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[purge-legiscan] Fatal error:', err);
      process.exit(1);
    });
}
