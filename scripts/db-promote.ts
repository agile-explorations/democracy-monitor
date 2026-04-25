/**
 * Selective data promotion from dev to production via promotion-manifest.json.
 *
 * Usage:
 *   DATABASE_URL=<dev> PROD_DATABASE_URL=<prod> pnpm db:promote [--dry-run]
 *
 * Workflow (additive changes):
 *   1. Merge develop -> main (Render deploys, migrations run)
 *   2. Run: pnpm db:promote
 *
 * The script does NOT run migrations. It only copies data.
 */

import { execSync } from 'child_process';
import { existsSync, readFileSync } from 'fs';
import { Client } from 'pg';

interface ManifestData {
  [table: string]: { where: string };
}

interface ManifestUpdates {
  [table: string]: { columns: string[]; where: string };
}

interface PromotionManifest {
  description: string;
  data: ManifestData;
  updates?: ManifestUpdates;
}

const MANIFEST_PATH = 'promotion-manifest.json';
const DRY_RUN = process.argv.includes('--dry-run');
const SKIP_BACKUP = process.argv.includes('--skip-backup');
async function main(): Promise<void> {
  const devUrl = process.env.DATABASE_URL;
  const prodUrl = process.env.PROD_DATABASE_URL;

  if (!devUrl) {
    console.error('ERROR: DATABASE_URL is required (source dev database)');
    process.exit(1);
  }
  if (!prodUrl) {
    console.error('ERROR: PROD_DATABASE_URL is required (target production database)');
    process.exit(1);
  }
  if (!existsSync(MANIFEST_PATH)) {
    console.error(
      `ERROR: ${MANIFEST_PATH} not found. Copy promotion-manifest.json.example and edit.`,
    );
    process.exit(1);
  }

  const manifest: PromotionManifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf-8'));
  console.log(`Promotion: ${manifest.description}`);
  console.log(`Tables: ${Object.keys(manifest.data).join(', ')}`);
  if (manifest.updates && Object.keys(manifest.updates).length > 0) {
    console.log(`Updates: ${Object.keys(manifest.updates).join(', ')}`);
  }
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const dev = new Client({ connectionString: devUrl });
  const prod = new Client({ connectionString: prodUrl });
  await dev.connect();
  await prod.connect();

  try {
    // Step 1: Compare migration journals
    await compareMigrations(dev, prod);

    // Step 2: Dry-run — report row counts
    for (const [table, { where }] of Object.entries(manifest.data)) {
      const devCount = await countRows(dev, table, where);
      const prodCount = await countRows(prod, table, where);
      console.log(
        `  ${table}: ${devCount} rows in dev (${prodCount} already in prod) [WHERE ${where}]`,
      );
    }

    if (manifest.updates) {
      for (const [table, { columns, where }] of Object.entries(manifest.updates)) {
        const devCount = await countRows(dev, table, where);
        console.log(`  ${table} (update ${columns.join(', ')}): ${devCount} rows [WHERE ${where}]`);
      }
    }

    if (DRY_RUN) {
      console.log('\n==> Dry run complete. No changes made.');
      return;
    }

    // Step 3: Backup production (skip with --skip-backup if you have an external backup)
    if (SKIP_BACKUP) {
      console.log('\n==> Skipping backup (--skip-backup).');
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const backupFile = `/tmp/dm-prod-backup-${timestamp}.pgdump`;
      console.log(`\n==> Backing up production to ${backupFile}...`);
      execSync(`pg_dump -Fc --no-owner --no-privileges "${prodUrl}" -f "${backupFile}"`, {
        timeout: 600_000,
      });
      console.log('    Backup complete.');
    }

    // Step 4: Promote data
    for (const [table, { where }] of Object.entries(manifest.data)) {
      await promoteTable(dev, prod, table, where);
    }

    // Step 5: Apply column updates
    if (manifest.updates) {
      for (const [table, { columns, where }] of Object.entries(manifest.updates)) {
        await updateColumns(dev, prod, table, columns, where);
      }
    }

    // Step 6: Reset ALL sequences to avoid ID collisions from promoted data.
    // Promoted rows may have higher IDs than the target DB's sequences expect,
    // causing collisions on subsequent inserts by snapshot/cron jobs.
    console.log('\n==> Resetting sequences...');
    const seqResult = await prod.query(
      `SELECT c.relname AS table_name, s.relname AS seq_name
       FROM pg_class s
       JOIN pg_depend d ON d.objid = s.oid
       JOIN pg_class c ON c.oid = d.refobjid
       WHERE s.relkind = 'S' AND c.relkind = 'r'`,
    );
    for (const { table_name, seq_name } of seqResult.rows) {
      try {
        await prod.query(
          `SELECT setval('"${seq_name}"', (SELECT COALESCE(MAX(id), 0) FROM "${table_name}"))`,
        );
        const { rows } = await prod.query(`SELECT last_value FROM "${seq_name}"`);
        console.log(`  ${seq_name}: ${rows[0].last_value}`);
      } catch {
        // Skip tables without an id column
      }
    }

    // Step 7: Validate
    console.log('\n==> Validating...');
    for (const [table, { where }] of Object.entries(manifest.data)) {
      const prodCount = await countRows(prod, table, where);
      console.log(`  ${table}: ${prodCount} rows in prod [WHERE ${where}]`);
    }

    console.log('\n==> Promotion complete.');
  } finally {
    await dev.end();
    await prod.end();
  }
}

async function compareMigrations(dev: Client, prod: Client): Promise<void> {
  console.log('==> Comparing migration journals...');
  try {
    const devResult = await dev.query(
      'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at',
    );
    const prodResult = await prod.query(
      'SELECT hash FROM drizzle.__drizzle_migrations ORDER BY created_at',
    );
    const devHashes = new Set(devResult.rows.map((r: { hash: string }) => r.hash));
    const prodHashes = new Set(prodResult.rows.map((r: { hash: string }) => r.hash));

    const devOnly = [...devHashes].filter((h) => !prodHashes.has(h));
    if (devOnly.length > 0) {
      console.warn(
        `    WARNING: Dev has ${devOnly.length} migration(s) not on prod. Deploy code first.`,
      );
    } else {
      console.log('    Migrations in sync.');
    }
  } catch {
    console.warn('    Could not compare migrations (table may not exist). Proceeding.');
  }
  console.log('');
}

async function countRows(client: Client, table: string, where: string): Promise<number> {
  const result = await client.query(`SELECT COUNT(*) FROM "${table}" WHERE ${where}`);
  return parseInt(result.rows[0].count, 10);
}

/** Resolve the primary key column for a table via information_schema. */
async function getPrimaryKeyColumn(client: Client, table: string): Promise<string> {
  const result = await client.query(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_name = $1 AND tc.constraint_type = 'PRIMARY KEY'
     LIMIT 1`,
    [table],
  );
  if (result.rows.length === 0) {
    throw new Error(`No primary key found for table "${table}"`);
  }
  return result.rows[0].column_name;
}

/** Get columns of the first non-PK unique constraint (e.g., url+category on documents). */
async function getUniqueConstraintColumns(client: Client, table: string): Promise<string[]> {
  const result = await client.query(
    `SELECT kcu.column_name
     FROM information_schema.table_constraints tc
     JOIN information_schema.key_column_usage kcu
       ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
     WHERE tc.table_name = $1 AND tc.constraint_type = 'UNIQUE'
       AND tc.constraint_name = (
         SELECT MIN(tc2.constraint_name)
         FROM information_schema.table_constraints tc2
         WHERE tc2.table_name = $1 AND tc2.constraint_type = 'UNIQUE'
       )
     ORDER BY kcu.ordinal_position`,
    [table],
  );
  return result.rows.map((r: { column_name: string }) => r.column_name);
}

/** Get column names for a table, excluding generated columns (e.g. search_vector). */
async function getColumns(client: Client, table: string): Promise<string[]> {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = $1 AND is_generated = 'NEVER'
     ORDER BY ordinal_position`,
    [table],
  );
  return result.rows.map((r: { column_name: string }) => r.column_name);
}

/**
 * Promote a table using COPY piped between two psql processes.
 * Data flows: dev psql COPY TO STDOUT → pipe → prod psql COPY FROM STDIN
 * into a temp table, then upserted into the real table via INSERT ON CONFLICT.
 *
 * This avoids the Node.js JS serialization layer entirely — no jsonb corruption,
 * no parameter count limits, and 10-20x faster than parameterized INSERT.
 */
async function promoteTable(
  dev: Client,
  prod: Client,
  table: string,
  where: string,
): Promise<void> {
  console.log(`\n==> Promoting ${table}...`);

  const columns = await getColumns(dev, table);
  const pkCol = await getPrimaryKeyColumn(dev, table);
  const colList = columns.map((c: string) => `"${c}"`).join(', ');

  const totalCount = await countRows(dev, table, where);
  if (totalCount === 0) {
    console.log('    No rows to promote.');
    return;
  }
  console.log(`    ${totalCount} rows to promote...`);

  const devUrl = process.env.DATABASE_URL!;
  const prodUrl = process.env.PROD_DATABASE_URL!;

  // Create staging table on prod (regular table, not TEMP, so psql can see it)
  const tempTable = `_promote_${table}_${Date.now()}`;
  await prod.query(`CREATE TABLE "${tempTable}" (LIKE "${table}" INCLUDING DEFAULTS)`);

  // Stream data: dev COPY TO → pipe → prod COPY FROM (via temp table)
  const copyOut = `\\COPY (SELECT ${colList} FROM "${table}" WHERE ${where}) TO STDOUT`;
  const copyIn = `\\COPY "${tempTable}" (${colList}) FROM STDIN`;
  execSync(`psql "${devUrl}" -c "${copyOut}" | psql "${prodUrl}" -c "${copyIn}"`, {
    stdio: 'inherit',
    timeout: 1_800_000,
  });

  // Determine upsert conflict target: prefer composite unique constraint over PK
  // (handles tables like documents where local+prod IDs diverge but url+category is stable)
  const uniqueCols = await getUniqueConstraintColumns(prod, table);
  const useUniqueConstraint = uniqueCols.length > 0;
  const conflictTarget = useUniqueConstraint
    ? uniqueCols.map((c) => `"${c}"`).join(', ')
    : `"${pkCol}"`;

  // When using non-PK conflict target, exclude PK from INSERT (let sequence generate IDs)
  // and from UPDATE SET (keep prod's existing IDs). This prevents PK collisions when
  // dev and prod have different auto-increment IDs for the same logical rows.
  const insertCols = useUniqueConstraint ? columns.filter((c) => c !== pkCol) : columns;
  const insertColList = insertCols.map((c: string) => `"${c}"`).join(', ');
  const excludeFromUpdate = useUniqueConstraint ? [...uniqueCols, pkCol] : [pkCol];
  const updateCols = columns
    .filter((c: string) => !excludeFromUpdate.includes(c))
    .map((c: string) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');

  console.log(`    Upserting into target table (conflict on: ${conflictTarget})...`);
  await prod.query(
    `INSERT INTO "${table}" (${insertColList})
     SELECT ${insertColList} FROM "${tempTable}"
     ON CONFLICT (${conflictTarget}) DO UPDATE SET ${updateCols}`,
  );

  await prod.query(`DROP TABLE "${tempTable}"`);
  console.log(`    Promoted ${totalCount} rows.`);
}

/** Update specific columns using COPY-based transfer + UPDATE FROM. */
async function updateColumns(
  dev: Client,
  prod: Client,
  table: string,
  columns: string[],
  where: string,
): Promise<void> {
  console.log(`\n==> Updating ${table} columns: ${columns.join(', ')}...`);

  const pkCol = await getPrimaryKeyColumn(dev, table);
  const selectCols = [pkCol, ...columns].map((c) => `"${c}"`).join(', ');

  const totalCount = await countRows(dev, table, where);
  if (totalCount === 0) {
    console.log('    No rows to update.');
    return;
  }
  console.log(`    ${totalCount} rows to update...`);

  const devUrl = process.env.DATABASE_URL!;
  const prodUrl = process.env.PROD_DATABASE_URL!;

  // Create temp table on prod with just the columns we need
  const tempTable = `_update_${table}_${Date.now()}`;
  const colDefs = await dev.query(
    `SELECT column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_name = $1 AND column_name = ANY($2)
     ORDER BY ordinal_position`,
    [table, [pkCol, ...columns]],
  );
  const createCols = colDefs.rows
    .map((r: { column_name: string; udt_name: string }) => `"${r.column_name}" ${r.udt_name}`)
    .join(', ');
  await prod.query(`CREATE TABLE "${tempTable}" (${createCols})`);

  // Stream data via COPY
  const copyOut = `\\COPY (SELECT ${selectCols} FROM "${table}" WHERE ${where}) TO STDOUT`;
  const copyIn = `\\COPY "${tempTable}" (${selectCols}) FROM STDIN`;
  execSync(`psql "${devUrl}" -c "${copyOut}" | psql "${prodUrl}" -c "${copyIn}"`, {
    stdio: 'inherit',
    timeout: 1_800_000,
  });

  // Bulk update from temp table
  const setClauses = columns.map((c) => `"${c}" = t."${c}"`).join(', ');
  const result = await prod.query(
    `UPDATE "${table}" SET ${setClauses} FROM "${tempTable}" t WHERE "${table}"."${pkCol}" = t."${pkCol}"`,
  );

  await prod.query(`DROP TABLE "${tempTable}"`);
  console.log(`    Updated ${result.rowCount ?? 0} rows.`);
}

main().catch((err) => {
  console.error('Promotion failed:', err);
  process.exit(1);
});
