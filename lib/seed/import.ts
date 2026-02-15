/**
 * Import seed data fixtures into the database.
 *
 * Usage:
 *   pnpm seed:import                     # Import all fixtures from lib/seed/fixtures/
 *   pnpm seed:import --from ./my-dir     # Custom input directory
 */

import fs from 'fs';
import path from 'path';
import { getDb, isDbAvailable } from '@/lib/db';
import {
  assessments,
  baselines,
  documentScores,
  weeklyAggregates,
  intentWeekly,
} from '@/lib/db/schema';

/**
 * Import order for light fixtures (calibrated outputs only).
 * Raw documents are excluded — they can be re-fetched via `pnpm backfill`.
 * document_scores.documentId is nullable, so scores import without documents.
 */
const IMPORT_ORDER = [
  { name: 'assessments', table: assessments },
  { name: 'baselines', table: baselines },
  { name: 'document_scores', table: documentScores },
  { name: 'weekly_aggregates', table: weeklyAggregates },
  { name: 'intent_weekly', table: intentWeekly },
] as const;

interface SeedFixture {
  metadata: { table: string; rowCount: number; exportedAt: string };
  rows: Record<string, unknown>[];
}

function readFixture(inputDir: string, tableName: string): SeedFixture | null {
  const filePath = path.join(inputDir, `${tableName}.json`);
  if (!fs.existsSync(filePath)) {
    console.log(`  ${tableName}: fixture not found — skipping`);
    return null;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as SeedFixture;
}

async function importTable(
  db: ReturnType<typeof getDb>,
  tableName: string,
  table: (typeof IMPORT_ORDER)[number]['table'],
  rows: Record<string, unknown>[],
): Promise<number> {
  if (rows.length === 0) {
    console.log(`  ${tableName}: 0 rows — nothing to import`);
    return 0;
  }

  // Strip auto-generated 'id' fields so the DB generates them
  const rowsWithoutIds = rows.map(({ id: _id, ...rest }) => rest);

  // Batch insert with ON CONFLICT DO NOTHING for idempotency
  const BATCH_SIZE = 500;
  let imported = 0;

  for (let i = 0; i < rowsWithoutIds.length; i += BATCH_SIZE) {
    const batch = rowsWithoutIds.slice(i, i + BATCH_SIZE);
    await db.insert(table).values(batch).onConflictDoNothing();
    imported += batch.length;
  }

  console.log(`  ${tableName}: ${imported} rows imported`);
  return imported;
}

export async function importSeedData(inputDir?: string): Promise<void> {
  if (!isDbAvailable()) {
    throw new Error('DATABASE_URL not configured');
  }

  const fixtureDir = inputDir || path.resolve(__dirname, 'fixtures');
  if (!fs.existsSync(fixtureDir)) {
    throw new Error(`Fixture directory not found: ${fixtureDir}`);
  }

  const db = getDb();
  console.log(`[seed:import] Importing from ${fixtureDir}`);

  let totalRows = 0;
  for (const { name, table } of IMPORT_ORDER) {
    const fixture = readFixture(fixtureDir, name);
    if (!fixture) continue;

    const count = await importTable(db, name, table, fixture.rows);
    totalRows += count;
  }

  console.log(`[seed:import] Done. ${totalRows} total rows imported.`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const args = process.argv.slice(2);
  let inputDir: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from') inputDir = args[++i];
  }

  importSeedData(inputDir)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed:import] Fatal error:', err);
      process.exit(1);
    });
}
