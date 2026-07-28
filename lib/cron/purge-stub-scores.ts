/**
 * CLI: pnpm scores:purge-stubs [--dry-run]
 *
 * #566: weekly documentCount aggregates from document_scores, and different
 * ingestion eras scored different things — the bulk-era pipeline scored every
 * docket stub while current rules score substantive docs only. This purges
 * score rows whose underlying document fails current scoring eligibility
 * (metadata_only, missing, content under 100 chars, or outside the #587
 * counting scope — incl. rows orphaned
 * by past document purges), then re-aggregates every affected category-week
 * with the count-preserving upsert (enrichment/statuses untouched here;
 * baselines:compute + scores:enrich follow in the runbook).
 *
 * Idempotent: a second run finds nothing to purge.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import { checkHelp } from '@/lib/utils/cli-help';

async function findPurgeTargets(): Promise<{
  rows: number;
  pairs: Array<{ category: string; weekOf: string }>;
}> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const res = await db.execute(sql`
    SELECT s.category, s.week_of::text AS week_of, count(*) AS n
    FROM document_scores s
    LEFT JOIN documents d ON d.url = s.url AND d.category = s.category
    WHERE d.url IS NULL
       OR d.content_type = 'metadata_only'
       OR d.content IS NULL
       OR length(d.content) < 100
       OR d.counting_scope IS FALSE
    GROUP BY s.category, s.week_of
    ORDER BY s.category, s.week_of
  `);
  const pairs = (res.rows as Array<{ category: string; week_of: string; n: string }>).map((r) => ({
    category: r.category,
    weekOf: r.week_of,
  }));
  const rows = (res.rows as Array<{ n: string }>).reduce((s, r) => s + Number(r.n), 0);
  return { rows, pairs };
}

export async function runPurgeStubScores(dryRun: boolean): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  const { rows, pairs } = await findPurgeTargets();
  console.log(`[purge-stubs] ${rows} stub/orphan score rows across ${pairs.length} category-weeks`);
  if (dryRun) {
    console.log('[purge-stubs] DRY RUN — no writes');
    return;
  }
  if (rows === 0) {
    console.log('[purge-stubs] nothing to purge');
    return;
  }

  const del = await db.execute(sql`
    DELETE FROM document_scores s
    USING (
      SELECT s2.url, s2.category
      FROM document_scores s2
      LEFT JOIN documents d ON d.url = s2.url AND d.category = s2.category
      WHERE d.url IS NULL
         OR d.content_type = 'metadata_only'
         OR d.content IS NULL
         OR length(d.content) < 100
         OR d.counting_scope IS FALSE
    ) t
    WHERE s.url = t.url AND s.category = t.category
  `);
  console.log(`[purge-stubs] deleted ${del.rowCount} score rows; re-aggregating...`);

  let done = 0;
  for (const { category, weekOf } of pairs) {
    const agg = await computeWeeklyAggregate(category, weekOf);
    await storeWeeklyAggregate(agg);
    done++;
    if (done % 100 === 0) console.log(`[purge-stubs] re-aggregated ${done}/${pairs.length}`);
  }
  console.log(`[purge-stubs] Complete: ${pairs.length} category-weeks re-aggregated`);

  // Referential hygiene for the assessment edge (#569 G5): assessments whose
  // documents were later deleted (noise purges) skew weekly flag-rate
  // denominators — buildAISummaryFromDB reads assessments without joining
  // documents. Baseline-period rows are covered by the standing approval rule
  // for the invoking runbook.
  const orphans = await db.execute(sql`
    DELETE FROM ai_document_assessments a
    WHERE NOT EXISTS (
      SELECT 1 FROM documents d WHERE d.url = a.url AND d.category = a.category
    )
  `);
  if ((orphans.rowCount ?? 0) > 0) {
    console.log(`[purge-stubs] deleted ${orphans.rowCount} orphaned assessment rows`);
  }
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm scores:purge-stubs [--dry-run]

Deletes document_scores rows whose document fails scoring eligibility
(metadata-only, absent, <100 chars of content, or outside the #587
counting scope) and re-aggregates the
affected weeks (count-preserving). Run baselines:compute + scores:enrich
afterwards per the runbook.`,
  );
  runPurgeStubScores(argv.includes('--dry-run')).catch((err) => {
    console.error('[purge-stubs] Fatal:', err);
    process.exit(1);
  });
}
