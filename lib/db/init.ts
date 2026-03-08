import { execSync } from 'child_process';
// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { Pool } from 'pg';

loadEnvConfig(process.cwd());

const DUMP_FILENAME = 'data-dump.pgdump';
const REPO = 'agile-explorations/democracy-monitor';
const RELEASE_TAG = 'data-latest';
const DOWNLOAD_URL = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${DUMP_FILENAME}`;

async function isDatabaseEmpty(connectionString: string): Promise<boolean> {
  const pool = new Pool({ connectionString });
  try {
    const result = await pool.query(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'documents'
      ) AS table_exists`,
    );
    if (!result.rows[0].table_exists) return true;

    const count = await pool.query('SELECT EXISTS (SELECT 1 FROM documents LIMIT 1) AS has_rows');
    return !count.rows[0].has_rows;
  } catch {
    return true;
  } finally {
    await pool.end();
  }
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const empty = await isDatabaseEmpty(connectionString);

  if (empty) {
    console.log('Database is empty — restoring from GitHub Release...');
    console.log(`Downloading ${DOWNLOAD_URL}`);
    execSync(`curl -fL -o /tmp/${DUMP_FILENAME} "${DOWNLOAD_URL}"`, {
      stdio: 'inherit',
    });

    console.log('Restoring database...');
    execSync(
      `pg_restore --no-owner --no-privileges --dbname "${connectionString}" /tmp/${DUMP_FILENAME}`,
      { stdio: 'inherit' },
    );

    execSync(`rm -f /tmp/${DUMP_FILENAME}`);
    console.log('Database restored successfully.');
  } else {
    console.log('Database already has data — skipping restore.');
  }

  console.log('Running migrations...');
  execSync('pnpm db:migrate', { stdio: 'inherit' });
  console.log('Database initialization complete.');
}

main().catch((err) => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
