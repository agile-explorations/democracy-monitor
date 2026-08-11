/**
 * Purge metadata-only CourtListener docket stubs (#697).
 *
 * Background: docket stubs (source_type='court_opinion', content_type=
 * 'metadata_only') were persisted only as the case-universe index — the sole
 * record of case→category routing. R-CASE-TRACKER moved that universe into
 * tracked_cases (bulk-seeded + ingest-upserted), so the ~283k stub rows are
 * redundant. This purge is gated on two pre-flight checks that each ABORT the
 * run: every target case_id must exist in tracked_cases, and no target may
 * carry score/assessment rows (stubs were never scored, per #566).
 *
 * No aggregate repair is needed afterward: stubs never contributed to
 * document_scores or weekly_aggregates. fetch_log is left untouched — it is
 * keyed per source/category/week (no per-document rows), and those fetches
 * genuinely happened; clearing them would falsely mark CL weeks unfetched.
 *
 * Usage:
 *   pnpm docs:purge-stubs              # Analyze + pre-flight only (dry run)
 *   pnpm docs:purge-stubs --confirm    # Delete stub document rows
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';

const STUB_CONDITION = sql`
  source_origin = 'courtlistener'
  AND source_type = 'court_opinion'
  AND content_type = 'metadata_only'
`;

interface PreflightResult {
  targetDocs: number;
  targetCases: number;
  casesMissingFromTracker: number;
  scoreRows: number;
  assessmentRows: number;
}

async function preflight(): Promise<PreflightResult> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  const counts = (
    await db.execute(sql`
      SELECT count(*) AS docs, count(DISTINCT case_id) AS cases
      FROM documents WHERE ${STUB_CONDITION}`)
  ).rows[0] as { docs: string; cases: string };

  const missing = (
    await db.execute(sql`
      SELECT count(DISTINCT d.case_id) AS n
      FROM documents d
      LEFT JOIN tracked_cases t ON t.case_id = d.case_id
      WHERE ${STUB_CONDITION} AND t.case_id IS NULL`)
  ).rows[0] as { n: string };

  const scores = (
    await db.execute(sql`
      SELECT count(*) AS n FROM document_scores
      WHERE url IN (SELECT url FROM documents WHERE ${STUB_CONDITION})`)
  ).rows[0] as { n: string };

  // Join by (url, category) — the contract every consumer and the G5 graph
  // invariant use. The original document_id join matched nothing (the column
  // is not reliably populated) and let the 2026-08-10 purge orphan 2,847
  // assessment rows that G5 then caught on prod.
  const assessments = (
    await db.execute(sql`
      SELECT count(*) AS n FROM ai_document_assessments a
      WHERE EXISTS (
        SELECT 1 FROM documents d
        WHERE ${STUB_CONDITION} AND d.url = a.url AND d.category = a.category)`)
  ).rows[0] as { n: string };

  return {
    targetDocs: Number(counts.docs),
    targetCases: Number(counts.cases),
    casesMissingFromTracker: Number(missing.n),
    scoreRows: Number(scores.n),
    assessmentRows: Number(assessments.n),
  };
}

async function purge(): Promise<{ deletedDocs: number }> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const docResult = await db.execute(sql`DELETE FROM documents WHERE ${STUB_CONDITION}`);
  return { deletedDocs: Number(docResult.rowCount ?? 0) };
}

function reportPreflight(pre: PreflightResult): void {
  console.log(`  Stub documents (metadata_only court_opinion): ${pre.targetDocs}`);
  console.log(`  Distinct cases among them:                    ${pre.targetCases}`);
  console.log(`  Cases MISSING from tracked_cases:             ${pre.casesMissingFromTracker}`);
  console.log(`  document_scores rows on targets:              ${pre.scoreRows}`);
  console.log(`  ai_document_assessments rows on targets:      ${pre.assessmentRows}`);
}

async function run(confirm: boolean): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');

  console.log('[purge-docket-stubs] Pre-flight analysis...\n');
  const pre = await preflight();
  reportPreflight(pre);

  if (pre.targetDocs === 0) {
    console.log('\n[purge-docket-stubs] No stub documents found. Nothing to do.');
    return;
  }
  if (pre.casesMissingFromTracker > 0) {
    throw new Error(
      `ABORT: ${pre.casesMissingFromTracker} stub cases are not in tracked_cases. ` +
        'Run pnpm cases:seed --confirm (local) / pnpm db:promote (prod) first.',
    );
  }
  if (pre.scoreRows > 0 || pre.assessmentRows > 0) {
    throw new Error(
      `ABORT: targets carry ${pre.scoreRows} score rows and ${pre.assessmentRows} ` +
        'assessment rows — stubs should never be scored (#566). Investigate before purging.',
    );
  }

  if (!confirm) {
    console.log('\n[purge-docket-stubs] Pre-flight PASSED. Dry run complete.');
    console.log('[purge-docket-stubs] Run with --confirm to delete.');
    return;
  }

  console.log('\n[purge-docket-stubs] Deleting stub document rows...');
  const result = await purge();
  console.log('\n[purge-docket-stubs] === Purge Complete ===');
  console.log(`  Documents deleted: ${result.deletedDocs}`);
  console.log('\n[purge-docket-stubs] No aggregate repair needed (stubs were never scored).');
  console.log(
    '[purge-docket-stubs] fetch_log intentionally untouched (per-week rows, fetches happened).',
  );
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm docs:purge-stubs [options]

Deletes metadata-only CourtListener docket stub document rows after verifying
every case is represented in tracked_cases and no target carries
score/assessment rows. fetch_log is left untouched.

Options:
  --confirm           Actually delete (default: dry run / pre-flight only)`,
  );
  run(args.includes('--confirm'))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[purge-docket-stubs] Fatal error:', err);
      process.exit(1);
    });
}
