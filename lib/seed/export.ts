/**
 * Export seed data from the database to JSON fixtures.
 *
 * Usage:
 *   pnpm seed:export                     # Export all tables to lib/seed/fixtures/
 *   pnpm seed:export --out ./my-dir      # Custom output directory
 */

import fs from 'fs';
import path from 'path';
import { getDb, isDbAvailable } from '@/lib/db';
import {
  assessments,
  baselines,
  documents,
  documentScores,
  weeklyAggregates,
  intentWeekly,
} from '@/lib/db/schema';

const SEED_TABLES = [
  { name: 'assessments', table: assessments },
  { name: 'baselines', table: baselines },
  { name: 'documents', table: documents },
  { name: 'document_scores', table: documentScores },
  { name: 'weekly_aggregates', table: weeklyAggregates },
  { name: 'intent_weekly', table: intentWeekly },
] as const;

interface SeedMetadata {
  exportedAt: string;
  table: string;
  rowCount: number;
}

interface SeedFixture<T = unknown> {
  metadata: SeedMetadata;
  rows: T[];
}

async function exportTable(
  db: ReturnType<typeof getDb>,
  tableName: string,
  table: (typeof SEED_TABLES)[number]['table'],
): Promise<SeedFixture> {
  const rows = await db.select().from(table);

  return {
    metadata: {
      exportedAt: new Date().toISOString(),
      table: tableName,
      rowCount: rows.length,
    },
    rows,
  };
}

function writeFixture(outDir: string, tableName: string, fixture: SeedFixture): void {
  const filePath = path.join(outDir, `${tableName}.json`);
  fs.writeFileSync(filePath, JSON.stringify(fixture, null, 2));
  console.log(`  ${tableName}: ${fixture.metadata.rowCount} rows → ${filePath}`);
}

export async function exportSeedData(outDir?: string): Promise<void> {
  if (!isDbAvailable()) {
    throw new Error('DATABASE_URL not configured');
  }

  const outputDir = outDir || path.resolve(__dirname, 'fixtures');
  fs.mkdirSync(outputDir, { recursive: true });

  const db = getDb();
  console.log(`[seed:export] Exporting to ${outputDir}`);

  for (const { name, table } of SEED_TABLES) {
    const fixture = await exportTable(db, name, table);
    writeFixture(outputDir, name, fixture);
  }

  console.log('[seed:export] Done.');
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const args = process.argv.slice(2);
  let outDir: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') outDir = args[++i];
  }

  exportSeedData(outDir)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed:export] Fatal error:', err);
      process.exit(1);
    });
}
