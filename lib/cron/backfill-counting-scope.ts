/**
 * CLI: pnpm scope:backfill [--dry-run] [--sample N]
 *
 * #587: stamps documents.counting_scope on every judicial opinion in the
 * court categories from the opinion-scope classifier, uniformly across all
 * eras, making document counts method-consistent across collection changes.
 * Set-based UPDATE uses the SQL twin of the TS classifier; after stamping,
 * a random sample is re-classified in TS and compared row-by-row — any
 * mismatch fails the run (exit 2) so the twins cannot drift silently.
 *
 * Idempotent. Read-only with --dry-run. Follows in the runbook:
 * scores:purge-stubs (purge out-of-scope score rows + re-aggregate),
 * baselines:compute (owner approval), scores:enrich, pipeline gates.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import {
  COUNTING_SCOPE_CATEGORIES,
  countingScopeSql,
  isInCountingScope,
  OPINION_SCOPE_CLASSIFIER_VERSION,
} from '@/lib/services/opinion-scope-classifier';
import { checkHelp } from '@/lib/utils/cli-help';

const DEFAULT_SAMPLE_SIZE = 500;

function categoryList(): string {
  return [...COUNTING_SCOPE_CATEGORIES].map((c) => `'${c}'`).join(', ');
}

const TARGET_DOCS = `documents.source_type = 'judicial_opinion'
    AND documents.category IN (${categoryList()})`;

async function reportScopeCounts(label: string): Promise<void> {
  const db = getDb(); // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const res = await db.execute(
    // nosemgrep: opengrep.no-sql-raw — every fragment is a compile-time constant derived from EXEC_POWER_PHRASES/COUNTING_SCOPE_CATEGORIES; no user input
    sql.raw(`
    SELECT category,
      count(*) FILTER (WHERE ${countingScopeSql('documents')}) AS in_scope,
      count(*) FILTER (WHERE NOT ${countingScopeSql('documents')}) AS out_of_scope,
      count(*) FILTER (WHERE counting_scope IS NULL) AS unstamped
    FROM documents
    WHERE ${TARGET_DOCS}
    GROUP BY category ORDER BY category`),
  );
  console.log(`[scope-backfill] ${label}:`);
  for (const r of res.rows as Array<Record<string, string>>) {
    console.log(
      `  ${r.category}: ${r.in_scope} in scope, ${r.out_of_scope} out of scope, ${r.unstamped} unstamped`,
    );
  }
}

/**
 * Default mode stamps only unstamped rows — one classifier evaluation per row
 * and interrupted runs resume where they left off. --restamp re-evaluates
 * every row (required after a classifier version bump).
 */
async function stampAll(restamp: boolean): Promise<number> {
  const db = getDb(); // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const guard = restamp
    ? `counting_scope IS DISTINCT FROM (${countingScopeSql('documents')})`
    : 'counting_scope IS NULL';
  const res = await db.execute(
    // nosemgrep: opengrep.no-sql-raw — every fragment is a compile-time constant derived from EXEC_POWER_PHRASES/COUNTING_SCOPE_CATEGORIES; no user input
    sql.raw(`
    UPDATE documents
    SET counting_scope = ${countingScopeSql('documents')}
    WHERE ${TARGET_DOCS}
      AND ${guard}`),
  );
  return res.rowCount ?? 0;
}

/** Re-classify a random stamped sample in TS and compare to the stored flag. */
async function verifySample(sampleSize: number): Promise<number> {
  const db = getDb(); // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  // nosemgrep: opengrep.no-sql-raw — TARGET_DOCS is a compile-time constant; no user input
  const target = sql.raw(TARGET_DOCS);
  const res = await db.execute(sql`
    SELECT id, title, content, counting_scope, metadata->>'agency' AS court
    FROM documents
    WHERE ${target} AND counting_scope IS NOT NULL
    ORDER BY random() LIMIT ${sampleSize}`);
  let mismatches = 0;
  for (const r of res.rows as Array<{
    id: number;
    title: string;
    content: string | null;
    counting_scope: boolean;
    court: string | null;
  }>) {
    const expected = isInCountingScope(r.court, r.title, r.content);
    if (expected !== r.counting_scope) {
      mismatches++;
      console.error(
        `[scope-backfill] MISMATCH doc ${r.id}: TS=${expected} SQL=${r.counting_scope} (${r.court})`,
      );
    }
  }
  return mismatches;
}

export async function runScopeBackfill(
  dryRun: boolean,
  sampleSize: number,
  restamp = false,
): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  console.log(`[scope-backfill] classifier v${OPINION_SCOPE_CLASSIFIER_VERSION}`);

  await reportScopeCounts(dryRun ? 'DRY RUN — would stamp' : 'pre-stamp state');
  if (dryRun) return;

  const stamped = await stampAll(restamp);
  console.log(
    `[scope-backfill] stamped ${stamped} rows (${restamp ? 'full re-stamp' : 'previously unstamped only'})`,
  );

  const mismatches = await verifySample(sampleSize);
  if (mismatches > 0) {
    console.error(
      `[scope-backfill] FAILED: ${mismatches}/${sampleSize} sample rows disagree between TS and SQL classifiers`,
    );
    process.exit(2);
  }
  console.log(`[scope-backfill] verified: ${sampleSize}-row sample, TS/SQL classifiers agree`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm scope:backfill [--dry-run] [--sample N] [--restamp]

Stamps documents.counting_scope on court-category judicial opinions from the
opinion-scope classifier (#587), uniformly across all eras, then verifies a
random sample against the TS classifier (exit 2 on any mismatch). Default
mode stamps NULL rows only (resumable); --restamp re-evaluates every row
(required after a classifier version bump). Run scores:purge-stubs afterwards
per the runbook to purge out-of-scope score rows and re-aggregate.`,
  );
  const sampleIdx = argv.indexOf('--sample');
  const sampleSize =
    sampleIdx >= 0 ? Number(argv[sampleIdx + 1]) || DEFAULT_SAMPLE_SIZE : DEFAULT_SAMPLE_SIZE;
  runScopeBackfill(argv.includes('--dry-run'), sampleSize, argv.includes('--restamp'))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[scope-backfill] failed:', err);
      process.exit(1);
    });
}
