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
const BATCH_SIZE = 500;

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

    // Step 3: Backup production
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFile = `/tmp/dm-prod-backup-${timestamp}.pgdump`;
    console.log(`\n==> Backing up production to ${backupFile}...`);
    execSync(`pg_dump -Fc --no-owner --no-privileges "${prodUrl}" -f "${backupFile}"`, {
      timeout: 600_000,
    });
    console.log('    Backup complete.');

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

    // Step 6: Validate
    console.log('\n==> Validating...');
    for (const [table, { where }] of Object.entries(manifest.data)) {
      const prodCount = await countRows(prod, table, where);
      console.log(`  ${table}: ${prodCount} rows in prod [WHERE ${where}]`);
    }

    console.log(`\n==> Promotion complete. Backup: ${backupFile}`);
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

/** Get column names for a table. */
async function getColumns(client: Client, table: string): Promise<string[]> {
  const result = await client.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_name = $1 ORDER BY ordinal_position`,
    [table],
  );
  return result.rows.map((r: { column_name: string }) => r.column_name);
}

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

  // Count total rows to promote
  const totalCount = await countRows(dev, table, where);
  if (totalCount === 0) {
    console.log('    No rows to promote.');
    return;
  }

  // Create temp table on prod
  const tempTable = `_promote_${table}_${Date.now()}`;
  await prod.query(`CREATE TEMP TABLE "${tempTable}" (LIKE "${table}" INCLUDING ALL)`);

  // Stream rows from dev in batches using LIMIT/OFFSET
  let promoted = 0;
  let offset = 0;

  while (offset < totalCount) {
    const batch = await dev.query(
      `SELECT ${colList} FROM "${table}" WHERE ${where} ORDER BY "${pkCol}" LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
    );
    if (batch.rows.length === 0) break;

    const placeholders = batch.rows
      .map(
        (_: unknown, rowIdx: number) =>
          `(${columns.map((_c: string, colIdx: number) => `$${rowIdx * columns.length + colIdx + 1}`).join(', ')})`,
      )
      .join(', ');
    const values = batch.rows.flatMap((row: Record<string, unknown>) =>
      columns.map((c: string) => row[c]),
    );
    await prod.query(`INSERT INTO "${tempTable}" (${colList}) VALUES ${placeholders}`, values);

    promoted += batch.rows.length;
    offset += BATCH_SIZE;

    if (promoted % 5000 === 0 || promoted === totalCount) {
      console.log(`    ${promoted}/${totalCount} rows loaded...`);
    }
  }

  // Upsert from temp to real table
  const updateCols = columns
    .filter((c: string) => c !== pkCol)
    .map((c: string) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');

  await prod.query(
    `INSERT INTO "${table}" (${colList})
     SELECT ${colList} FROM "${tempTable}"
     ON CONFLICT ("${pkCol}") DO UPDATE SET ${updateCols}`,
  );

  await prod.query(`DROP TABLE "${tempTable}"`);
  console.log(`    Promoted ${promoted} rows.`);
}

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

  // Count rows to update
  const totalCount = await countRows(dev, table, where);
  if (totalCount === 0) {
    console.log('    No rows to update.');
    return;
  }

  // Batch updates using temp table + UPDATE FROM
  const tempTable = `_update_${table}_${Date.now()}`;
  const tempCols = [pkCol, ...columns];
  const tempColList = tempCols.map((c) => `"${c}"`).join(', ');

  // Create temp table with just the columns we need
  const colDefs = await dev.query(
    `SELECT column_name, data_type, udt_name
     FROM information_schema.columns
     WHERE table_name = $1 AND column_name = ANY($2)
     ORDER BY ordinal_position`,
    [table, tempCols],
  );
  const createCols = colDefs.rows
    .map((r: { column_name: string; udt_name: string }) => `"${r.column_name}" ${r.udt_name}`)
    .join(', ');
  await prod.query(`CREATE TEMP TABLE "${tempTable}" (${createCols})`);

  // Load data in batches
  let loaded = 0;
  let offset = 0;

  while (offset < totalCount) {
    const batch = await dev.query(
      `SELECT ${selectCols} FROM "${table}" WHERE ${where} ORDER BY "${pkCol}" LIMIT ${BATCH_SIZE} OFFSET ${offset}`,
    );
    if (batch.rows.length === 0) break;

    const placeholders = batch.rows
      .map(
        (_: unknown, rowIdx: number) =>
          `(${tempCols.map((_c: string, colIdx: number) => `$${rowIdx * tempCols.length + colIdx + 1}`).join(', ')})`,
      )
      .join(', ');
    const values = batch.rows.flatMap((row: Record<string, unknown>) =>
      tempCols.map((c: string) => row[c]),
    );
    await prod.query(`INSERT INTO "${tempTable}" (${tempColList}) VALUES ${placeholders}`, values);

    loaded += batch.rows.length;
    offset += BATCH_SIZE;
  }

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
