import { execSync } from 'child_process';
// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { Pool } from 'pg';

loadEnvConfig(process.cwd());

// Primary source: single pg_dump -Fc file from the app's persistent disk
const APP_DUMP_URL = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://democracymonitor.us'}/api/data/dump`;

// Fallback: GitHub Releases (two-file archive format, used for initial deploy bootstrap)
const ARCHIVE_FILENAME = 'data-dump.tar.gz';
const EMBEDDINGS_FILENAME = 'embeddings.bin.gz';
const DUMP_FILENAME = 'data-dump.pgdump';
const DOCS_CSV_FILENAME = 'documents-no-embedding.csv.gz';
const REPO = 'agile-explorations/democracy-monitor';
const RELEASE_TAG = 'data-latest';
const ARCHIVE_URL = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${ARCHIVE_FILENAME}`;
const EMBEDDINGS_URL = `https://github.com/${REPO}/releases/download/${RELEASE_TAG}/${EMBEDDINGS_FILENAME}`;

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

/**
 * Newer pg_dump versions emit SET commands (e.g. `transaction_timeout`,
 * PG17+) that older servers reject. pg_restore completes the restore, counts
 * them under "errors ignored on restore", and still exits 1 — which must not
 * be read as failure (#561: doing so triggered the destructive archive
 * fallback over a fully restored database).
 */
const BENIGN_RESTORE_ERROR = /unrecognized configuration parameter/;

function runPgRestore(cmd: string): boolean {
  try {
    // stderr piped (not inherited) so ignored-error output can be inspected.
    execSync(cmd, { stdio: ['ignore', 'inherit', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
    return true;
  } catch (err) {
    const stderr = (err as { stderr?: Buffer }).stderr?.toString() ?? '';
    process.stderr.write(stderr);
    const errorLines = stderr.split('\n').filter((l) => l.includes('pg_restore: error:'));
    if (
      errorLines.length > 0 &&
      errorLines.every((l) => BENIGN_RESTORE_ERROR.test(l)) &&
      stderr.includes('errors ignored on restore')
    ) {
      console.warn(
        'pg_restore completed with benign ignored errors (version-mismatch SET commands).',
      );
      return true;
    }
    return false;
  }
}

// ---------------------------------------------------------------------------
// Primary restore: single pg_dump file from app endpoint
// ---------------------------------------------------------------------------

function restoreFromApp(connectionString: string, force: boolean): boolean {
  console.log(`Streaming dump from ${APP_DUMP_URL}...`);

  const flags = force
    ? '--clean --if-exists --no-owner --no-privileges'
    : '--no-owner --no-privileges';

  // Stream curl directly into pg_restore via shell pipe — avoids writing to /tmp
  // entirely (works in Render one-off jobs with limited ephemeral storage).
  // pg_restore reads custom-format dumps from stdin in single-pass mode.
  // bash -c with pipefail ensures a curl failure isn't masked by pg_restore success.
  // -# forces curl's progress bar to stderr even when piped (default disables it).
  const restored = runPgRestore(
    `bash -c "set -o pipefail; curl -fL -# '${APP_DUMP_URL}' | pg_restore ${flags} --dbname '${connectionString}'"`,
  );
  if (!restored) return false;

  execSync(
    `psql "${connectionString}" -c "SELECT setval('documents_id_seq', (SELECT COALESCE(MAX(id), 0) FROM documents))"`,
    { stdio: 'inherit' },
  );

  console.log('Database restored from app endpoint.');
  return true;
}

// ---------------------------------------------------------------------------
// Fallback restore: GitHub Releases archive (two-file split format)
// ---------------------------------------------------------------------------

function restoreEmbeddings(connectionString: string): void {
  console.log('Downloading embeddings...');
  const downloaded = tryExec(`curl -fL -o /tmp/${EMBEDDINGS_FILENAME} "${EMBEDDINGS_URL}"`);
  if (!downloaded) {
    console.warn('WARNING: Embeddings download failed — search will fall back to keyword mode.');
    return;
  }
  console.log('Restoring embeddings...');
  const restored = tryExec(
    `gunzip -c /tmp/${EMBEDDINGS_FILENAME} | psql "${connectionString}" -c "CREATE TEMP TABLE _emb (id integer, embedding vector(1536)); COPY _emb FROM STDIN WITH BINARY; UPDATE documents SET embedding = _emb.embedding FROM _emb WHERE documents.id = _emb.id; DROP TABLE _emb;"`,
  );
  console.log(restored ? 'Embeddings restored.' : 'WARNING: Embedding restore failed.');
  execSync(`rm -f /tmp/${EMBEDDINGS_FILENAME}`);
}

function restoreFromArchive(connectionString: string, force: boolean): void {
  const flags = force
    ? '--clean --if-exists --no-owner --no-privileges'
    : '--no-owner --no-privileges';

  console.log(`Downloading ${ARCHIVE_URL}...`);
  execSync(`curl -fL -o /tmp/${ARCHIVE_FILENAME} "${ARCHIVE_URL}"`, { stdio: 'inherit' });

  console.log('Extracting archive...');
  execSync(`tar -xzf /tmp/${ARCHIVE_FILENAME} -C /tmp`, { stdio: 'inherit' });

  console.log('Restoring main database...');
  if (!runPgRestore(`pg_restore ${flags} --dbname "${connectionString}" /tmp/${DUMP_FILENAME}`)) {
    throw new Error('Archive pg_restore failed');
  }

  if (force) {
    execSync(`psql "${connectionString}" -c "TRUNCATE documents CASCADE"`, { stdio: 'inherit' });
  }

  console.log('Restoring documents table...');
  execSync(
    `gunzip -c /tmp/${DOCS_CSV_FILENAME} | psql "${connectionString}" -c "\\copy documents(id, source_type, category, title, content, url, published_at, fetched_at, metadata, source_origin, case_id, speaker, content_type, embedded_at, retrieval_relevant) FROM STDIN WITH CSV HEADER"`,
    { stdio: 'inherit' },
  );

  execSync(
    `psql "${connectionString}" -c "SELECT setval('documents_id_seq', (SELECT COALESCE(MAX(id), 0) FROM documents))"`,
    { stdio: 'inherit' },
  );

  restoreEmbeddings(connectionString);

  execSync(`rm -f /tmp/${ARCHIVE_FILENAME} /tmp/${DUMP_FILENAME} /tmp/${DOCS_CSV_FILENAME}`);
  console.log('Database restored from GitHub Releases archive.');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error('DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  const force = process.argv.includes('--force');
  const empty = await isDatabaseEmpty(connectionString);

  if (empty || force) {
    const label = force && !empty ? '--force: overwriting existing database' : 'Database is empty';
    console.log(`${label} — restoring from latest dump...`);

    // Try single-file dump from app endpoint first
    const restored = restoreFromApp(connectionString, force);
    if (!restored) {
      if (!empty) {
        // #561: the archive fallback's --clean would replace existing data
        // with the (potentially months-old) GitHub release. Only acceptable
        // when bootstrapping an empty database — never over real data.
        console.error(
          'App-endpoint restore failed on a non-empty database. NOT falling back to the ' +
            'GitHub Releases archive (stale-release risk) — fix the endpoint or restore manually.',
        );
        process.exit(1);
      }
      // Fall back to GitHub Releases archive (two-file split)
      console.log('App endpoint not available, falling back to GitHub Releases...');
      restoreFromArchive(connectionString, force);
    }
  } else {
    console.log('Database already has data — skipping restore. Use --force to overwrite.');
  }

  console.log('Running migrations...');
  execSync('pnpm db:migrate', { stdio: 'inherit' });
  console.log('Database initialization complete.');
}

main().catch((err) => {
  console.error('Database initialization failed:', err);
  process.exit(1);
});
