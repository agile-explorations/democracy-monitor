import { execSync } from 'child_process';
// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { Pool } from 'pg';

loadEnvConfig(process.cwd());

const ARCHIVE_FILENAME = 'data-dump.tar.gz';
const EMBEDDINGS_FILENAME = 'embeddings.bin.gz';
const DUMP_FILENAME = 'data-dump.pgdump';
const DOCS_CSV_FILENAME = 'documents-no-embedding.csv.gz';
const REPO = 'agile-explorations/democracy-monitor';
const RELEASE_TAG = 'data-latest';
const DOWNLOAD_URL = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${ARCHIVE_FILENAME}`;
const EMBEDDINGS_URL = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${EMBEDDINGS_FILENAME}`;

// Legacy fallback — older releases used a single pgdump file
const LEGACY_DUMP_URL = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${DUMP_FILENAME}`;

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

function tryExec(cmd: string): boolean {
  try {
    execSync(cmd, { stdio: 'inherit' });
    return true;
  } catch {
    return false;
  }
}

function tryRestoreEmbeddings(connectionString: string): void {
  console.log('Downloading embeddings (optional)...');
  const downloaded = tryExec(`curl -fL -o /tmp/${EMBEDDINGS_FILENAME} "${EMBEDDINGS_URL}"`);
  if (!downloaded) {
    console.log('Embeddings not available — run pnpm embeddings:backfill to generate.');
    return;
  }
  console.log('Restoring embeddings...');
  const restored = tryExec(
    `gunzip -c /tmp/${EMBEDDINGS_FILENAME} | psql "${connectionString}" -c "CREATE TEMP TABLE _emb (id integer, embedding vector(1536)); COPY _emb FROM STDIN WITH BINARY; UPDATE documents SET embedding = _emb.embedding FROM _emb WHERE documents.id = _emb.id; DROP TABLE _emb;"`,
  );
  console.log(
    restored ? 'Embeddings restored.' : 'Embedding restore failed — run pnpm embeddings:backfill.',
  );
  execSync(`rm -f /tmp/${EMBEDDINGS_FILENAME}`);
}

async function restoreFromArchive(connectionString: string): Promise<void> {
  console.log(`Downloading ${DOWNLOAD_URL}`);
  const archiveDownloaded = tryExec(`curl -fL -o /tmp/${ARCHIVE_FILENAME} "${DOWNLOAD_URL}"`);

  if (archiveDownloaded) {
    console.log('Extracting archive...');
    execSync(`tar -xzf /tmp/${ARCHIVE_FILENAME} -C /tmp`, { stdio: 'inherit' });

    console.log('Restoring main database...');
    execSync(
      `pg_restore --no-owner --no-privileges --dbname "${connectionString}" /tmp/${DUMP_FILENAME}`,
      { stdio: 'inherit' },
    );

    console.log('Restoring documents table...');
    execSync(
      `gunzip -c /tmp/${DOCS_CSV_FILENAME} | psql "${connectionString}" -c "\\copy documents(id, source_type, category, title, content, url, published_at, fetched_at, metadata, source_origin, case_id, speaker, content_type, embedded_at) FROM STDIN WITH CSV HEADER"`,
      { stdio: 'inherit' },
    );

    execSync(
      `psql "${connectionString}" -c "SELECT setval('documents_id_seq', (SELECT COALESCE(MAX(id), 0) FROM documents))"`,
      { stdio: 'inherit' },
    );

    tryRestoreEmbeddings(connectionString);

    execSync(`rm -f /tmp/${ARCHIVE_FILENAME} /tmp/${DUMP_FILENAME} /tmp/${DOCS_CSV_FILENAME}`);
    console.log('Database restored from archive.');
    return;
  }

  // Legacy fallback: try single pgdump file
  console.log('Archive not found, trying legacy dump format...');
  console.log(`Downloading ${LEGACY_DUMP_URL}`);
  execSync(`curl -fL -o /tmp/${DUMP_FILENAME} "${LEGACY_DUMP_URL}"`, {
    stdio: 'inherit',
  });

  console.log('Restoring database (legacy format)...');
  execSync(
    `pg_restore --no-owner --no-privileges --dbname "${connectionString}" /tmp/${DUMP_FILENAME}`,
    { stdio: 'inherit' },
  );

  execSync(`rm -f /tmp/${DUMP_FILENAME}`);
  console.log('Database restored from legacy dump.');
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
    await restoreFromArchive(connectionString);
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
