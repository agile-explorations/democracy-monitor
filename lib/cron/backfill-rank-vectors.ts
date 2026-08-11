/**
 * Batched backfill of documents.search_rank_vector (#703).
 *
 * The compact ranking tsvector (title A + first 20k content chars B) is
 * trigger-maintained for new writes; this fills existing rows in id-ordered
 * batches so the hybrid FTS retrieval arm (which ranks only non-null rows)
 * reaches full coverage. Purely mechanical — recomputes a derived column from
 * stored title/content; touches rows in ALL periods including baselines, so
 * production runs require explicit owner approval per the baseline-write rule.
 *
 * Usage:
 *   pnpm search:backfill-rank              # Dry run: report remaining rows
 *   pnpm search:backfill-rank --confirm    # Backfill (batches of 2000)
 */

import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';

const BATCH_SIZE = 2000;

async function remaining(): Promise<number> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const r = await db.execute(
    sql`SELECT count(*) AS n FROM documents WHERE search_rank_vector IS NULL`,
  );
  return Number((r.rows[0] as { n: string }).n);
}

async function runBackfill(): Promise<void> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  // Keyset pagination by id: each batch is an index range scan. A
  // "WHERE ... IS NULL LIMIT n" selector re-scans the growing filled prefix
  // every batch (accidentally quadratic — measured ~2.7k rows/min).
  const [bounds] = (await db.execute(sql`SELECT min(id) AS lo, max(id) AS hi FROM documents`))
    .rows as Array<{ lo: number | null; hi: number | null }>;
  if (bounds.lo == null || bounds.hi == null) {
    console.log('[rank-backfill] No rows.');
    return;
  }
  let total = 0;
  for (let start = Number(bounds.lo); start <= Number(bounds.hi); start += BATCH_SIZE) {
    const result = await db.execute(sql`
      UPDATE documents SET search_rank_vector =
        setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
        setweight(to_tsvector('english', left(coalesce(content, ''), 20000)), 'B')
      WHERE id >= ${start} AND id < ${start + BATCH_SIZE}
        AND search_rank_vector IS NULL`);
    total += Number(result.rowCount ?? 0);
    if (start % (BATCH_SIZE * 25) < BATCH_SIZE)
      console.log(`[rank-backfill] through id ${start + BATCH_SIZE}: ${total} rows filled...`);
  }
  console.log(`[rank-backfill] Complete: ${total} rows filled.`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm search:backfill-rank [options]

Options:
  --confirm           Run the batched backfill (default: dry run / count only)`,
  );
  (async () => {
    if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
    const before = await remaining();
    console.log(`[rank-backfill] Rows without search_rank_vector: ${before}`);
    if (!args.includes('--confirm')) {
      console.log('[rank-backfill] Dry run complete. Run with --confirm to backfill.');
      return;
    }
    await runBackfill();
  })()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[rank-backfill] Fatal error:', err);
      process.exit(1);
    });
}
