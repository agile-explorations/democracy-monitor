import { readFileSync } from 'fs';
import { join } from 'path';
// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import type { JournalEntry } from './migration-safety';
import { pendingDestructiveMigrations, shouldBlockMigration } from './migration-safety';

loadEnvConfig(process.cwd());

const MIGRATIONS_DIR = './drizzle';

/** Count migrations Drizzle has already applied (0 if the table is absent). */
async function appliedMigrationCount(pool: Pool): Promise<number> {
  try {
    const { rows } = await pool.query<{ count: string }>(
      'SELECT count(*)::int AS count FROM drizzle."__drizzle_migrations"',
    );
    return Number(rows[0]?.count ?? 0);
  } catch {
    // nosemgrep: opengrep.no-silent-catch — a missing migrations table means a
    // fresh DB with nothing applied; treat as 0 rather than failing the gate.
    return 0;
  }
}

/**
 * Refuse to auto-apply destructive DDL in production without an explicit ack
 * (#618). Runs before migrate() so nothing is applied when it blocks.
 */
async function guardDestructiveMigrations(pool: Pool): Promise<void> {
  const journal = JSON.parse(
    readFileSync(join(MIGRATIONS_DIR, 'meta', '_journal.json'), 'utf8'),
  ) as { entries: JournalEntry[] };
  const applied = await appliedMigrationCount(pool);
  const destructive = pendingDestructiveMigrations(journal.entries, applied, (tag) =>
    readFileSync(join(MIGRATIONS_DIR, `${tag}.sql`), 'utf8'),
  );
  if (destructive.length === 0) return;

  console.warn('\n[migrate] Pending migrations contain destructive DDL:');
  for (const m of destructive) console.warn(`  - ${m.tag}: ${m.statements.join(', ')}`);

  const isProduction = process.env.NODE_ENV === 'production';
  const confirmed = process.env.CONFIRM_DESTRUCTIVE_MIGRATION === '1';
  if (shouldBlockMigration({ destructive, isProduction, confirmed })) {
    console.error(
      '\n[migrate] BLOCKED: destructive migration in production. Review the statements ' +
        'above, then re-run with CONFIRM_DESTRUCTIVE_MIGRATION=1 to proceed.',
    );
    process.exit(1);
  }
  console.warn('[migrate] Proceeding (non-production or CONFIRM_DESTRUCTIVE_MIGRATION set).\n');
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString });
  const db = drizzle(pool);

  await guardDestructiveMigrations(pool);

  console.log('Running migrations...');
  await migrate(db, { migrationsFolder: MIGRATIONS_DIR });
  console.log('Migrations complete.');

  await pool.end();
}

main().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
