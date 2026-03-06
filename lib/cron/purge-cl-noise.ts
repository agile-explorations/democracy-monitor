/**
 * Purge noise CourtListener documents from civilLiberties.
 *
 * Background: The old cl_first_amendment signal used unscoped `q=first+amendment`
 * which fetched dockets with irrelevant NOS codes (Insurance, Patent, Fraud, etc.).
 * Valid CL docs in civilLiberties come from cl_civil_rights (NOS 440) and
 * cl_habeas (NOS 530). The query was fixed in Sprint R-S1d but ~41K old docs remain.
 *
 * Usage:
 *   pnpm cl:purge-noise              # Analyze only (dry run)
 *   pnpm cl:purge-noise --confirm    # Delete noise + clear fetch_log
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';

/** NOS descriptions that indicate valid civil rights/liberties cases. */
const VALID_NOS_PATTERNS = [
  '%Civil Rights%', // NOS 440-448
  '%Habeas%', // NOS 530, 535
  '%Prisoner%', // NOS 540-550 (civil rights adjacent)
  '%First Amendment%', // Explicitly about 1A
];

interface PurgeResult {
  totalCl: number;
  validDocs: number;
  noiseDocs: number;
  deletedDocuments: number;
  deletedScores: number;
  deletedAssessments: number;
  clearedFetchLog: number;
}

async function analyzeNoise(): Promise<{
  total: number;
  noise: number;
  topNos: Array<{ suit: string; count: number }>;
}> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  const totalResult = await db.execute(sql`
    SELECT count(*) as count FROM documents
    WHERE source_origin = 'courtlistener' AND category = 'civilLiberties'
  `);
  const total = Number(totalResult.rows[0]?.count ?? 0);

  const validResult = await db.execute(sql`
    SELECT count(*) as count FROM documents
    WHERE source_origin = 'courtlistener' AND category = 'civilLiberties'
    AND (${sql.join(
      VALID_NOS_PATTERNS.map((p) => sql`metadata->>'suitNature' LIKE ${p}`),
      sql` OR `,
    )})
  `);
  const valid = Number(validResult.rows[0]?.count ?? 0);

  const topNos = await db.execute(sql`
    SELECT metadata->>'suitNature' as suit, count(*) as count
    FROM documents
    WHERE source_origin = 'courtlistener' AND category = 'civilLiberties'
    AND NOT (${sql.join(
      VALID_NOS_PATTERNS.map((p) => sql`metadata->>'suitNature' LIKE ${p}`),
      sql` OR `,
    )})
    GROUP BY metadata->>'suitNature'
    ORDER BY count DESC
    LIMIT 20
  `);

  return {
    total,
    noise: total - valid,
    topNos: topNos.rows.map((r) => ({
      suit: String(r.suit ?? '(null)'),
      count: Number(r.count),
    })),
  };
}

async function purgeNoise(): Promise<PurgeResult> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const analysis = await analyzeNoise();

  const noiseCondition = sql`
    source_origin = 'courtlistener' AND category = 'civilLiberties'
    AND NOT (${sql.join(
      VALID_NOS_PATTERNS.map((p) => sql`metadata->>'suitNature' LIKE ${p}`),
      sql` OR `,
    )})
  `;

  // Delete from ai_document_assessments (references documents.id)
  const assessResult = await db.execute(sql`
    DELETE FROM ai_document_assessments
    WHERE document_id IN (SELECT id FROM documents WHERE ${noiseCondition})
  `);

  // Delete from document_scores (references documents.url + category)
  const scoreResult = await db.execute(sql`
    DELETE FROM document_scores
    WHERE url IN (SELECT url FROM documents WHERE ${noiseCondition})
    AND category = 'civilLiberties'
  `);

  // Delete noise documents
  const docResult = await db.execute(sql`
    DELETE FROM documents WHERE ${noiseCondition}
  `);

  // Clear fetch_log for civilLiberties courtlistener so re-backfill works
  const fetchLogResult = await db.execute(sql`
    DELETE FROM fetch_log
    WHERE category = 'civilLiberties' AND source_origin = 'courtlistener'
  `);

  return {
    totalCl: analysis.total,
    validDocs: analysis.total - analysis.noise,
    noiseDocs: analysis.noise,
    deletedDocuments: Number(docResult.rowCount ?? 0),
    deletedScores: Number(scoreResult.rowCount ?? 0),
    deletedAssessments: Number(assessResult.rowCount ?? 0),
    clearedFetchLog: Number(fetchLogResult.rowCount ?? 0),
  };
}

async function run(confirm: boolean): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');

  console.log('[purge-cl-noise] Analyzing civilLiberties CourtListener documents...\n');
  const analysis = await analyzeNoise();

  console.log(`  Total CL docs in civilLiberties: ${analysis.total}`);
  console.log(`  Noise docs (invalid NOS):        ${analysis.noise}`);
  console.log(`  Valid docs (to keep):             ${analysis.total - analysis.noise}`);

  if (analysis.topNos.length > 0) {
    console.log('\n  Top noise suitNature values:');
    for (const { suit, count } of analysis.topNos) {
      console.log(`    ${count.toString().padStart(6)} — ${suit}`);
    }
  }

  if (analysis.noise === 0) {
    console.log('\n[purge-cl-noise] No noise documents found. Nothing to do.');
    return;
  }

  if (!confirm) {
    console.log('\n[purge-cl-noise] Dry run complete. Run with --confirm to delete.');
    return;
  }

  console.log('\n[purge-cl-noise] Purging noise documents...');
  const result = await purgeNoise();

  console.log('\n[purge-cl-noise] === Purge Complete ===');
  console.log(`  Documents deleted:    ${result.deletedDocuments}`);
  console.log(`  Scores deleted:       ${result.deletedScores}`);
  console.log(`  AI assessments deleted: ${result.deletedAssessments}`);
  console.log(`  Fetch log entries cleared: ${result.clearedFetchLog}`);
  console.log('\n[purge-cl-noise] Next steps:');
  console.log('  1. pnpm scores:recompute --category civilLiberties');
  console.log('  2. pnpm baselines:compute');
  console.log('  3. pnpm validate:ingest --category civilLiberties');
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm cl:purge-noise [options]

Options:
  --confirm           Actually delete (default: dry run / analysis only)`,
  );
  const confirm = args.includes('--confirm');
  run(confirm)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[purge-cl-noise] Fatal error:', err);
      process.exit(1);
    });
}
