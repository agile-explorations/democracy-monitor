/**
 * Purge CREC amendment-text noise documents from the database.
 *
 * Background: 10,483 of 23,386 CREC docs (44.8%) are raw amendment text dumps
 * (subGranuleClass: SAMENDMENTTEXTIND, SAMENDMENTTEXT, SAMENDMENTSSUB) with zero
 * analytical value. Broad topic-routing terms match inside these long text dumps,
 * inflating category counts dramatically (e.g., military has 75% amendment noise).
 *
 * The procedural filter has been updated (NOISE-1) to block future ingestion.
 * This script purges existing noise docs.
 *
 * Usage:
 *   pnpm crec:purge-noise              # Analyze only (dry run)
 *   pnpm crec:purge-noise --confirm    # Delete noise documents
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';

const AMENDMENT_SUBCLASSES = ['SAMENDMENTTEXTIND', 'SAMENDMENTTEXT', 'SAMENDMENTSSUB'];

interface CategoryCount {
  category: string;
  count: number;
}

interface PurgeResult {
  deletedDocuments: number;
  deletedScores: number;
  deletedAssessments: number;
  deletedP2025Matches: number;
}

async function analyze(): Promise<{ total: number; noise: number; byCategory: CategoryCount[] }> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  const totalResult = await db.execute(sql`
    SELECT count(*) as count FROM documents WHERE source_origin = 'crec'
  `);
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const noiseResult = await db.execute(sql`
    SELECT category, count(*) as count FROM documents
    WHERE source_origin = 'crec'
    AND metadata->>'subGranuleClass' IN (${sql.join(
      AMENDMENT_SUBCLASSES.map((c) => sql`${c}`),
      sql`, `,
    )})
    GROUP BY category ORDER BY count DESC
  `);

  const byCategory: CategoryCount[] = noiseResult.rows.map((r) => ({
    category: String(r.category ?? '(null)'),
    count: Number(r.count),
  }));

  const noise = byCategory.reduce((sum, c) => sum + c.count, 0);

  return { total, noise, byCategory };
}

async function purge(): Promise<PurgeResult> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  const noiseCondition = sql`
    source_origin = 'crec'
    AND metadata->>'subGranuleClass' IN (${sql.join(
      AMENDMENT_SUBCLASSES.map((c) => sql`${c}`),
      sql`, `,
    )})
  `;

  // Delete in FK-safe order
  const assessResult = await db.execute(sql`
    DELETE FROM ai_document_assessments
    WHERE document_id IN (SELECT id FROM documents WHERE ${noiseCondition})
  `);

  const scoreResult = await db.execute(sql`
    DELETE FROM document_scores
    WHERE url IN (SELECT url FROM documents WHERE ${noiseCondition})
  `);

  const p2025Result = await db.execute(sql`
    DELETE FROM p2025_matches
    WHERE document_id IN (SELECT id FROM documents WHERE ${noiseCondition})
  `);

  const docResult = await db.execute(sql`
    DELETE FROM documents WHERE ${noiseCondition}
  `);

  return {
    deletedDocuments: Number(docResult.rowCount ?? 0),
    deletedScores: Number(scoreResult.rowCount ?? 0),
    deletedAssessments: Number(assessResult.rowCount ?? 0),
    deletedP2025Matches: Number(p2025Result.rowCount ?? 0),
  };
}

async function run(confirm: boolean): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');

  console.log('[purge-crec-noise] Analyzing CREC amendment-text documents...\n');
  const { total, noise, byCategory } = await analyze();

  console.log(`  Total CREC docs:      ${total}`);
  console.log(`  Amendment noise docs: ${noise}`);
  console.log(`  Valid docs (to keep): ${total - noise}`);

  if (byCategory.length > 0) {
    console.log('\n  Noise docs per category:');
    for (const { category, count } of byCategory) {
      console.log(`    ${count.toString().padStart(6)} - ${category}`);
    }
  }

  if (noise === 0) {
    console.log('\n[purge-crec-noise] No amendment noise documents found. Nothing to do.');
    return;
  }

  if (!confirm) {
    console.log('\n[purge-crec-noise] Dry run complete. Run with --confirm to delete.');
    return;
  }

  console.log('\n[purge-crec-noise] Purging amendment noise documents...');
  const result = await purge();

  console.log('\n[purge-crec-noise] === Purge Complete ===');
  console.log(`  Documents deleted:      ${result.deletedDocuments}`);
  console.log(`  Scores deleted:         ${result.deletedScores}`);
  console.log(`  AI assessments deleted: ${result.deletedAssessments}`);
  console.log(`  P2025 matches deleted:  ${result.deletedP2025Matches}`);
  console.log('\n[purge-crec-noise] Next steps:');
  console.log('  1. pnpm scores:recompute');
  console.log('  2. pnpm scores:enrich');
  console.log('  3. pnpm baselines:compute');
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm crec:purge-noise [options]

Options:
  --confirm           Actually delete (default: dry run / analysis only)`,
  );
  const confirm = args.includes('--confirm');
  run(confirm)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[purge-crec-noise] Fatal error:', err);
      process.exit(1);
    });
}
