/**
 * CLI: pnpm aggregates:backfill-gaps [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--dry-run]
 *
 * #567: creates the missing weekly_aggregates rows for category-weeks that
 * have none — zero-document weeks the snapshot failed to store (the row is
 * valid data: "absence is meaningful"; a missing row renders as
 * instrument-failure "No data" in the heatmap). Rows are stored bare
 * (count-preserving upsert); run scores:enrich over the range afterwards so
 * they carry convergence statuses. Idempotent.
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import { checkHelp } from '@/lib/utils/cli-help';

interface GapOptions {
  from: string;
  to: string;
  dryRun: boolean;
}

export async function runBackfillAggregateGaps(opts: GapOptions): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  if (opts.from < '2025-01-20') {
    console.warn(
      '[aggregate-gaps] WARNING: range includes baseline periods (<2025-01-20) — ' +
        'baseline writes require explicit per-invocation approval',
    );
  }
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  const holes = await db.execute(sql`
    WITH cats AS (SELECT DISTINCT category FROM weekly_aggregates),
    weeks AS (SELECT generate_series(${opts.from}::date, ${opts.to}::date, '7 days'::interval)::date AS w)
    SELECT c.category, w.w::text AS week_of
    FROM cats c CROSS JOIN weeks w
    WHERE NOT EXISTS (
      SELECT 1 FROM weekly_aggregates wa WHERE wa.category = c.category AND wa.week_of = w.w
    )
    ORDER BY c.category, w.w
  `);
  const pairs = holes.rows as Array<{ category: string; week_of: string }>;
  console.log(
    `[aggregate-gaps] ${pairs.length} missing category-weeks in ${opts.from}..${opts.to}`,
  );
  for (const p of pairs) console.log(`  ${p.category} ${p.week_of}`);
  if (opts.dryRun) {
    console.log('[aggregate-gaps] DRY RUN — no writes');
    return;
  }

  let n = 0;
  for (const p of pairs) {
    const agg = await computeWeeklyAggregate(p.category, p.week_of);
    await storeWeeklyAggregate(agg);
    n++;
  }
  console.log(`[aggregate-gaps] inserted ${n} aggregate rows (bare — run scores:enrich next)`);
}

function parseArgs(argv: string[]): GapOptions {
  const opts: GapOptions = {
    from: '2025-01-20',
    to: new Date().toISOString().slice(0, 10),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') opts.from = argv[++i];
    else if (argv[i] === '--to') opts.to = argv[++i];
    else if (argv[i] === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm aggregates:backfill-gaps [options]

Creates missing weekly_aggregates rows (zero-document weeks the snapshot
skipped). Bare rows only — run scores:enrich over the same range afterwards.

Options:
  --from <date>   Grid start (default 2025-01-20)
  --to <date>     Grid end (default today)
  --dry-run       List holes without writing`,
  );
  runBackfillAggregateGaps(parseArgs(argv)).catch((err) => {
    console.error('[aggregate-gaps] Fatal:', err);
    process.exit(1);
  });
}
