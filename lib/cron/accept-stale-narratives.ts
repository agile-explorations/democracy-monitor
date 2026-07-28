/**
 * CLI: pnpm narratives:accept-stale [--dry-run]
 *
 * Owner acknowledgment for G4h narrative staleness. Repairs and review
 * backfills bump assessment data under past weeks; regenerating those
 * narratives is AI spend the owner may decline. This stamps
 * staleness_accepted_at = now() on every narrative that is CURRENTLY stale
 * (assessment data newer than generated_at, outside the recent G4 window),
 * recording the decision without touching generated_at — provenance is never
 * rewritten. G4h then counts only staleness newer than its acceptance, so
 * future repairs surface from a quiet baseline instead of drowning in
 * already-reviewed noise.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';

/** Matches NARRATIVE_FRESHNESS_WEEKS in validate-graph.ts: the recent window is G4's (error) territory. */
const RECENT_WINDOW_WEEKS = 1;

const STALE_UNACCEPTED = sql`
  FROM narratives n
  JOIN LATERAL (
    SELECT max(a.assessed_at) AS newest FROM ai_document_assessments a
    WHERE a.category = n.category
      AND a.week_of >= n.week_of AND a.week_of < n.week_of + 7
  ) x ON x.newest IS NOT NULL
  WHERE n.generated_at < x.newest
    AND (n.staleness_accepted_at IS NULL OR n.staleness_accepted_at < x.newest)
    AND n.week_of < date_trunc('week', now())::date - (${RECENT_WINDOW_WEEKS * 7})::int`;

export async function runAcceptStale(dryRun: boolean): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  const count = await db.execute(sql`SELECT count(*) AS n ${STALE_UNACCEPTED}`);
  const n = Number((count.rows[0] as { n: string }).n);
  console.log(`[accept-stale] ${n} historical narratives with unacknowledged staleness`);
  if (dryRun || n === 0) {
    if (dryRun) console.log('[accept-stale] DRY RUN — no writes');
    return;
  }

  const res = await db.execute(sql`
    UPDATE narratives SET staleness_accepted_at = now()
    WHERE id IN (SELECT n.id ${STALE_UNACCEPTED})`);
  console.log(
    `[accept-stale] accepted ${res.rowCount} narratives as-is (generated_at untouched); G4h now reports only new staleness`,
  );
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm narratives:accept-stale [--dry-run]

Stamps staleness_accepted_at on all currently-stale historical narratives
(G4h set), recording an owner decision not to regenerate them. Assessment
data newer than the stamp re-flags a narrative. generated_at is never
modified.`,
  );
  runAcceptStale(argv.includes('--dry-run')).catch((err) => {
    console.error('[accept-stale] Fatal:', err);
    process.exit(1);
  });
}
