/**
 * One-time backfill: populate source_origin for existing documents.
 *
 * Usage: npx tsx scripts/backfill-source-origin.ts [--dry-run]
 */
// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';

async function backfillSourceOrigin(dryRun: boolean): Promise<void> {
  const db = getDb();

  const rules = [
    {
      label: 'FR doc types → federal_register',
      where: sql`source_origin IS NULL AND source_type IN ('Notice','Rule','Proposed Rule','Presidential Document','executive_order','presidential_memorandum','proclamation','presidential_notice','final_rule','proposed_rule','notice')`,
      origin: 'federal_register',
    },
    {
      label: 'rhetoric + whitehouse URL → whitehouse',
      where: sql`source_origin IS NULL AND source_type = 'rhetoric' AND url LIKE '%whitehouse%'`,
      origin: 'whitehouse',
    },
    {
      label: 'rhetoric + gdelt URL → gdelt',
      where: sql`source_origin IS NULL AND source_type = 'rhetoric' AND url LIKE '%gdelt%'`,
      origin: 'gdelt',
    },
    {
      label: 'remaining rhetoric → gdelt (conservative default)',
      where: sql`source_origin IS NULL AND source_type = 'rhetoric'`,
      origin: 'gdelt',
    },
    {
      label: 'rss type → rss',
      where: sql`source_origin IS NULL AND source_type = 'rss'`,
      origin: 'rss',
    },
  ];

  for (const rule of rules) {
    if (dryRun) {
      const countResult = await db.execute(
        sql`SELECT count(*)::int AS cnt FROM documents WHERE ${rule.where}`,
      );
      const cnt = (countResult.rows[0] as { cnt: number }).cnt;
      console.log(`[dry-run] ${rule.label}: ${cnt} rows`);
    } else {
      const result = await db.execute(
        sql`UPDATE documents SET source_origin = ${rule.origin} WHERE ${rule.where}`,
      );
      console.log(`${rule.label}: ${result.rowCount} rows updated`);
    }
  }
}

// CLI entry
loadEnvConfig(process.cwd());
const dryRun = process.argv.includes('--dry-run');
console.log(`[backfill-source-origin] ${dryRun ? '(DRY RUN) ' : ''}Starting...`);
backfillSourceOrigin(dryRun)
  .then(() => {
    console.log('[backfill-source-origin] Done.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('[backfill-source-origin] Fatal:', err);
    process.exit(1);
  });
