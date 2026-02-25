/**
 * Rename category keys in all database tables.
 *
 * Renames:
 *   - 'courts' → 'judicialIndependence'
 *   - 'igs' → 'executiveOversight'
 *
 * Idempotent: safe to re-run (UPDATEs only match old names).
 *
 * Usage:
 *   npx tsx scripts/rename-categories.ts
 *   npx tsx scripts/rename-categories.ts --dry-run
 */
// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';

const RENAMES: Array<{ from: string; to: string }> = [
  { from: 'courts', to: 'judicialIndependence' },
  { from: 'igs', to: 'executiveOversight' },
];

/** Tables with a `category` varchar column. */
const TABLES_WITH_CATEGORY = [
  'documents',
  'ai_document_assessments',
  'weekly_aggregates',
  'document_scores',
  'baselines',
  'source_health',
  'assessments',
  'alerts',
  'debates',
  'keyword_trends',
  'cycle_adjustment_factors',
];

/** Tables with a `dashboard_category` varchar column. */
const TABLES_WITH_DASHBOARD_CATEGORY = ['p2025_proposals'];

async function renameColumn(
  db: ReturnType<typeof getDb>,
  table: string,
  column: string,
  from: string,
  to: string,
  dryRun: boolean,
): Promise<void> {
  const countResult = await db.execute(
    sql.raw(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${column} = '${from}'`),
  );
  const count = Number(countResult.rows?.[0]?.cnt ?? 0);

  if (count === 0) {
    console.log(`  ${table}.${column}: 0 rows (skip)`);
    return;
  }

  if (dryRun) {
    console.log(`  ${table}.${column}: ${count} rows (dry-run, would rename)`);
  } else {
    await db.execute(
      sql.raw(`UPDATE ${table} SET ${column} = '${to}' WHERE ${column} = '${from}'`),
    );
    console.log(`  ${table}.${column}: ${count} rows renamed`);
  }
}

async function renameJsonbArray(
  db: ReturnType<typeof getDb>,
  table: string,
  column: string,
  from: string,
  to: string,
  dryRun: boolean,
): Promise<void> {
  const countResult = await db.execute(
    sql.raw(`SELECT COUNT(*) as cnt FROM ${table} WHERE ${column}::jsonb @> '"${from}"'::jsonb`),
  );
  const count = Number(countResult.rows?.[0]?.cnt ?? 0);

  if (count === 0) {
    console.log(`  ${table}.${column} (jsonb): 0 rows (skip)`);
    return;
  }

  if (dryRun) {
    console.log(`  ${table}.${column} (jsonb): ${count} rows (dry-run, would rename)`);
  } else {
    await db.execute(
      sql.raw(
        `UPDATE ${table} SET ${column} = (
          SELECT jsonb_agg(
            CASE WHEN elem::text = '"${from}"' THEN '"${to}"'::jsonb ELSE elem END
          )
          FROM jsonb_array_elements(${column}::jsonb) AS elem
        ) WHERE ${column}::jsonb @> '"${from}"'::jsonb`,
      ),
    );
    console.log(`  ${table}.${column} (jsonb): ${count} rows renamed`);
  }
}

async function main() {
  loadEnvConfig(process.cwd());

  const dryRun = process.argv.includes('--dry-run');

  if (!(await isDbAvailable())) {
    console.error('Database not available. Set DATABASE_URL.');
    process.exit(1);
  }

  const db = getDb();

  for (const { from, to } of RENAMES) {
    console.log(`\nRenaming '${from}' → '${to}':`);

    for (const table of TABLES_WITH_CATEGORY) {
      await renameColumn(db, table, 'category', from, to, dryRun);
    }

    for (const table of TABLES_WITH_DASHBOARD_CATEGORY) {
      await renameColumn(db, table, 'dashboard_category', from, to, dryRun);
    }

    // JSONB array columns containing category strings
    await renameJsonbArray(db, 'legal_documents', 'relevant_categories', from, to, dryRun);
    await renameJsonbArray(db, 'semantic_clusters', 'categories', from, to, dryRun);
  }

  console.log(dryRun ? '\nDry run complete.' : '\nAll renames complete.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
