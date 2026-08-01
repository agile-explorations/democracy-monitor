/**
 * CourtListener bulk data staging — load CSV dumps into PostgreSQL
 * using CL's official schema, query via SQL facade, store documents.
 *
 * Uses CL's schema SQL (schema-YYYY-MM-DD.sql from S3) for table creation
 * and their documented COPY format: FORMAT csv, ENCODING utf8, ESCAPE '\'.
 *
 * Replaces the in-memory 4-pass pipeline (cl-bulk-pipeline.ts) which OOMs
 * on the 71.2M-row dockets file. PostgreSQL handles the heavy JOINs;
 * Node.js only processes the small matched result set (~5-50K rows).
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import { CIRCUIT_COURT_IDS, EXEC_POWER_PHRASES } from '@/lib/data/court-queries';
import { resolveDbSsl } from '@/lib/db/ssl';
import { findBulkFiles, routeDocket, yearsToDateRanges } from '@/lib/services/cl-bulk-pipeline';
import type { BulkPipelineResult } from '@/lib/services/cl-bulk-pipeline';
import {
  buildOpinionContentItem,
  OPINION_TYPE_LABELS,
  PROCEDURAL_OPINION_TYPES,
  toContentItem,
} from '@/lib/services/courtlistener-fetcher';
import type { OpinionData } from '@/lib/services/courtlistener-fetcher';
import { classifyOpinionToCategories } from '@/lib/services/crec-classifier';
import { storeDocuments } from '@/lib/services/document-store';

const CL_BASE_URL = 'https://www.courtlistener.com';
const STAGING_TABLES = [
  'search_court',
  'search_docket',
  'search_opinioncluster',
  'search_opinion',
] as const;
const COPY_OPTS = `FORMAT csv, ENCODING utf8, ESCAPE '\\', HEADER`;
const CLUSTER_IDS_FILE = '/tmp/cl_matched_clusters.txt';

/** CSV filenames → CL table names + column lists (from the official load script). */
const TABLE_DEFS: Record<string, { table: string; columns: string }> = {
  courts: {
    table: 'search_court',
    columns: `id, pacer_court_id, pacer_has_rss_feed, pacer_rss_entry_types,
      date_last_pacer_contact, fjc_court_id, date_modified, in_use,
      has_opinion_scraper, has_oral_argument_scraper, position, citation_string,
      short_name, full_name, url, start_date, end_date, jurisdiction, notes,
      parent_court_id`,
  },
  dockets: {
    table: 'search_docket',
    columns: `id, date_created, date_modified, source, appeal_from_str,
      assigned_to_str, referred_to_str, panel_str, date_last_index,
      date_cert_granted, date_cert_denied, date_argued, date_reargued,
      date_reargument_denied, date_filed, date_terminated, date_last_filing,
      case_name_short, case_name, case_name_full, slug, docket_number,
      docket_number_core, pacer_case_id, cause, nature_of_suit, jury_demand,
      jurisdiction_type, appellate_fee_status, appellate_case_type_information,
      mdl_status, filepath_local, filepath_ia, filepath_ia_json,
      ia_upload_failure_count, ia_needs_upload, ia_date_first_change,
      view_count, date_blocked, blocked, appeal_from_id, assigned_to_id,
      court_id, idb_data_id, originating_court_information_id, referred_to_id,
      federal_dn_case_type, federal_dn_office_code,
      federal_dn_judge_initials_assigned, federal_dn_judge_initials_referred,
      federal_defendant_number, parent_docket_id, docket_number_raw,
      docket_number_source`,
  },
  clusters: {
    table: 'search_opinioncluster',
    columns: `id, date_created, date_modified, judges, date_filed,
      date_filed_is_approximate, slug, case_name_short, case_name,
      case_name_full, scdb_id, scdb_decision_direction, scdb_votes_majority,
      scdb_votes_minority, source, procedural_history, attorneys,
      nature_of_suit, posture, syllabus, headnotes, summary, disposition,
      history, other_dates, cross_reference, correction, citation_count,
      precedential_status, date_blocked, blocked, filepath_json_harvard,
      filepath_pdf_harvard, docket_id, arguments, headmatter`,
  },
  opinions: {
    table: 'search_opinion',
    columns: `id, cluster_id, type, plain_text, download_url`,
  },
};

// ---------------------------------------------------------------------------
// Pool helper
// ---------------------------------------------------------------------------

let _pool: Pool | null = null;

function getPool(): Pool {
  if (!_pool) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL not set');
    _pool = new Pool({ connectionString: url, ssl: resolveDbSsl(url) });
  }
  return _pool;
}

export async function closeStagingPool(): Promise<void> {
  if (_pool) {
    await _pool.end();
    _pool = null;
  }
}

function logMemory(label: string): void {
  const { rss, heapUsed } = process.memoryUsage();
  const mb = (n: number) => (n / 1_000_000).toFixed(0);
  console.log(`[cl-bulk] Memory (${label}): RSS=${mb(rss)}MB, heap=${mb(heapUsed)}MB`);
}

// ---------------------------------------------------------------------------
// Phase 1: Create and load staging tables
// ---------------------------------------------------------------------------

/**
 * Create a staging table from the CL schema SQL file.
 * Columns present in the schema but absent from the COPY column list get
 * DEFAULT '' (text) or DEFAULT NULL (nullable) so COPY doesn't fail.
 */
function createTable(schemaPath: string, tableName: string, copyColumns: string): void {
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  const re = new RegExp(`CREATE TABLE public\\.${tableName} \\([^;]+\\);`, 's');
  const match = schema.match(re);
  if (!match) throw new Error(`Table ${tableName} not found in ${schemaPath}`);

  // Identify columns in schema but not in COPY list → add defaults
  const copyCols = new Set(
    copyColumns
      .replace(/\s+/g, ' ')
      .split(',')
      .map((c) => c.trim()),
  );
  let ddl = match[0];
  const colRe = /^\s+(\w+)\s+(.*?)$/gm;
  let colMatch;
  while ((colMatch = colRe.exec(ddl)) !== null) {
    const colName = colMatch[1];
    if (colName === 'CONSTRAINT') continue;
    if (
      !copyCols.has(colName) &&
      colMatch[2].includes('NOT NULL') &&
      !colMatch[2].includes('DEFAULT')
    ) {
      // Add a default for missing NOT NULL columns
      const isText = /text|character varying/.test(colMatch[2]);
      const defaultVal = isText ? "DEFAULT ''" : 'DEFAULT NULL';
      ddl = ddl.replace(colMatch[0], colMatch[0].replace('NOT NULL', `${defaultVal} NOT NULL`));
    }
  }

  const dbUrl = process.env.DATABASE_URL!;
  execSync(`psql "${dbUrl}" -c "DROP TABLE IF EXISTS ${tableName} CASCADE"`, { stdio: 'pipe' });
  const tmpFile = '/tmp/cl_staging_ddl.sql';
  fs.writeFileSync(tmpFile, ddl);
  execSync(`psql "${dbUrl}" -f "${tmpFile}"`, { stdio: 'pipe' });
  fs.unlinkSync(tmpFile);
  console.log(`[cl-bulk] Created ${tableName}`);
}

/** COPY a bz2-compressed CSV into a staging table via pipe. */
function loadTable(csvPath: string, def: { table: string; columns: string }): void {
  const dbUrl = process.env.DATABASE_URL!;
  const decompress = csvPath.endsWith('.bz2')
    ? `bunzip2 --stdout "${csvPath}"`
    : `cat "${csvPath}"`;
  const cols = def.columns.replace(/\s+/g, ' ').trim();
  const copyCmd = `\\COPY public.${def.table} (${cols}) FROM STDIN WITH (${COPY_OPTS})`;
  console.log(`[cl-bulk] Loading ${def.table} from ${path.basename(csvPath)}...`);
  execSync(`${decompress} | psql "${dbUrl}" -c "${copyCmd}"`, {
    stdio: 'inherit',
    timeout: 7_200_000,
  });
}

/** Create indexes on staging tables for the facade query. */
async function createStagingIndexes(): Promise<void> {
  const pool = getPool();
  console.log('[cl-bulk] Creating indexes...');
  const indexes = [
    `CREATE INDEX IF NOT EXISTS idx_sc_jurisdiction ON search_court (jurisdiction)`,
    `CREATE INDEX IF NOT EXISTS idx_sd_court_id ON search_docket (court_id)`,
    `CREATE INDEX IF NOT EXISTS idx_sd_nos ON search_docket (nature_of_suit)`,
    `CREATE INDEX IF NOT EXISTS idx_soc_docket_id ON search_opinioncluster (docket_id)`,
    `CREATE INDEX IF NOT EXISTS idx_soc_date_filed ON search_opinioncluster (date_filed)`,
  ];
  for (const ddl of indexes) await pool.query(ddl);
  console.log('[cl-bulk] Indexes created');
}

/** Load courts, dockets, and clusters into staging tables. */
export async function loadBaseStagingData(dataDir: string): Promise<void> {
  const files = findBulkFiles(dataDir, { opinionsOptional: true });
  const schemaFile = findSchemaFile(dataDir);
  logMemory('before load');

  const filesToLoad: Array<[string, string]> = [
    ['courts', files.courts],
    ['dockets', files.dockets],
    ['clusters', files.clusters],
  ];

  for (const [key, csvPath] of filesToLoad) {
    const def = TABLE_DEFS[key];
    createTable(schemaFile, def.table, def.columns);
    loadTable(csvPath, def);
    const count = await getPool().query(`SELECT count(*) FROM ${def.table}`);
    console.log(`[cl-bulk] ${def.table}: ${count.rows[0].count} rows`);
  }

  await createStagingIndexes();
  logMemory('after load + index');
}

/** Find the schema SQL file in the data directory. */
function findSchemaFile(dataDir: string): string {
  const files = fs.readdirSync(dataDir);
  const match = files.find((f) => f.startsWith('schema-') && f.endsWith('.sql'));
  if (!match) throw new Error(`No schema-*.sql file found in ${dataDir}`);
  return path.join(dataDir, match);
}

// ---------------------------------------------------------------------------
// Phase 3: Facade query
// ---------------------------------------------------------------------------

interface MatchedDocketRow {
  docket_id: number;
  case_name: string;
  court_name: string;
  nature_of_suit: string;
  cause: string;
  docket_number: string;
  docket_date_filed: string;
  slug: string;
  cluster_id: number | null;
  cluster_date_filed: string | null;
  matched_opinion_text: boolean;
}

/** Check if search_opinion staging table is loaded. */
async function hasOpinionTable(): Promise<boolean> {
  const r = await getPool().query(
    `SELECT 1 FROM information_schema.tables WHERE table_name = 'search_opinion' LIMIT 1`,
  );
  return r.rows.length > 0;
}

const FIRST_AMENDMENT_RE = `'\\mfirst amendment\\M'`;
const FIRST_AMENDMENT_QUALIFIERS = `'\\m(violation|injunction|challenge|retaliation|free speech|free press)\\M'`;

/** Bulk-SQL analogs of the court-scoped queries (#555) — see lib/data/court-queries.ts. */
const EXEC_POWER_RE = `'\\m(${EXEC_POWER_PHRASES.join('|')})\\M'`;
const CIRCUIT_COURT_ID_SQL = CIRCUIT_COURT_IDS.split(' ')
  .map((id) => `'${id}'`)
  .join(', ');

/** Build the facade SQL query for matched dockets. */
function buildFacadeQuery(docketDateClause: string, searchOpinionText: boolean): string {
  const nc = `(COALESCE(d.case_name,'') || ' ' || COALESCE(d.cause,''))`;
  const docketTextMatch = `${nc} ~* ${FIRST_AMENDMENT_RE} AND ${nc} ~* ${FIRST_AMENDMENT_QUALIFIERS}`;
  const opinionTextCte = searchOpinionText
    ? `opinion_text_matches AS (
        SELECT DISTINCT oc.docket_id
        FROM search_opinion o
        JOIN search_opinioncluster oc ON o.cluster_id = oc.id
        WHERE o.plain_text ~* ${FIRST_AMENDMENT_RE}
          AND o.plain_text ~* ${FIRST_AMENDMENT_QUALIFIERS}
      ),`
    : '';

  const opinionMatch = searchOpinionText
    ? `OR d.id IN (SELECT docket_id FROM opinion_text_matches)`
    : '';

  return `
    WITH ${opinionTextCte}
    matching_dockets AS (
      SELECT d.id AS docket_id,
        COALESCE(d.case_name, '(untitled case)') AS case_name,
        COALESCE(ct.full_name, d.court_id) AS court_name,
        COALESCE(d.nature_of_suit, '') AS nature_of_suit,
        COALESCE(d.cause, '') AS cause,
        COALESCE(d.docket_number, '') AS docket_number,
        d.date_filed::text AS docket_date_filed,
        COALESCE(d.slug, '') AS slug,
        ${searchOpinionText ? `(d.id IN (SELECT docket_id FROM opinion_text_matches))` : 'false'}
          AS matched_opinion_text
      FROM search_docket d
      JOIN search_court ct ON d.court_id = ct.id
      WHERE ct.jurisdiction IN ('F', 'FD', 'FB')
        AND (
          substring(d.nature_of_suit FROM '^\\d{3}') IN ('440', '530', '890')
          OR (${docketTextMatch})
          ${opinionMatch}
        )
        AND (${docketDateClause})
    ),
    latest_clusters AS (
      SELECT DISTINCT ON (c.docket_id)
        c.id AS cluster_id, c.docket_id, c.date_filed::text AS cluster_date_filed
      FROM search_opinioncluster c
      WHERE c.docket_id IN (SELECT docket_id FROM matching_dockets)
      ORDER BY c.docket_id, c.date_filed DESC
    )
    SELECT md.*, lc.cluster_id, lc.cluster_date_filed
    FROM matching_dockets md
    LEFT JOIN latest_clusters lc ON md.docket_id = lc.docket_id
    ORDER BY md.docket_date_filed DESC`;
}

/**
 * Query matched dockets from staging tables, replicating CL API filters.
 * Filters dockets by date_filed (matching CL RECAP search filed_after/filed_before).
 * LEFT JOINs clusters so dockets without opinions are included.
 * When search_opinion is loaded, also searches opinion text for first-amendment matches.
 */
export async function queryMatchedDockets(years: number[]): Promise<MatchedDocketRow[]> {
  const dateRanges = yearsToDateRanges(years);
  const dateClause = dateRanges
    .map((r) => `(d.date_filed >= '${r.start}' AND d.date_filed <= '${r.end}')`)
    .join(' OR ');

  const searchOpinionText = await hasOpinionTable();
  const sql = buildFacadeQuery(dateClause, searchOpinionText);

  console.log(
    `[cl-bulk] Running facade query for years: ${years.join(', ')}` +
      ` (opinion text search: ${searchOpinionText ? 'yes' : 'no'})...`,
  );
  const result = await getPool().query(sql);
  console.log(`[cl-bulk] Facade query: ${result.rows.length} matched dockets`);
  return result.rows as MatchedDocketRow[];
}

// ---------------------------------------------------------------------------
// Phase 4: Load opinions (lean — plain_text only, no HTML/XML columns)
// ---------------------------------------------------------------------------

/**
 * Load ALL opinions with lean columns (id, cluster_id, type, plain_text, download_url).
 * Uses a Python column filter to extract only needed columns from the 50GB CSV,
 * reducing PG storage from ~300GB to ~60-80GB.
 */
export async function loadOpinions(opinionsPath: string): Promise<number> {
  const dbUrl = process.env.DATABASE_URL!;
  const pool = getPool();

  // Create lean table (not from schema — custom definition for 5 columns only)
  await pool.query(`DROP TABLE IF EXISTS search_opinion CASCADE`);
  await pool.query(`
    CREATE TABLE search_opinion (
      id integer NOT NULL,
      cluster_id integer NOT NULL,
      type character varying(20) NOT NULL,
      plain_text text NOT NULL,
      download_url character varying(500)
    )
  `);
  console.log(`[cl-bulk] Created lean search_opinion (5 columns)`);

  const columnFilter = path.resolve(__dirname, '../../scripts/cl-opinion-columns.py');
  const decompress = opinionsPath.endsWith('.bz2')
    ? `bunzip2 --stdout "${opinionsPath}"`
    : `cat "${opinionsPath}"`;
  const cols = TABLE_DEFS.opinions.columns.replace(/\s+/g, ' ').trim();
  const copyCmd = `\\COPY public.search_opinion (${cols}) FROM STDIN WITH (${COPY_OPTS})`;
  const cmd = `${decompress} | python3 "${columnFilter}" | psql "${dbUrl}" -c "${copyCmd}"`;

  console.log(`[cl-bulk] Loading lean opinions from ${path.basename(opinionsPath)}...`);
  execSync(cmd, { stdio: 'inherit', timeout: 14_400_000 }); // 4hr timeout for 50GB

  console.log(`[cl-bulk] Creating indexes on search_opinion...`);
  await pool.query(`CREATE INDEX idx_so_cluster_id ON search_opinion (cluster_id)`);

  const count = await pool.query(`SELECT count(*) FROM search_opinion`);
  const n = parseInt(count.rows[0].count, 10);
  console.log(`[cl-bulk] search_opinion: ${n} rows`);
  logMemory('after opinion load');
  return n;
}

// ---------------------------------------------------------------------------
// Phase 5: Build and store documents
// ---------------------------------------------------------------------------

interface OpinionRow {
  type: string;
  plain_text: string;
  download_url: string;
}

/** Group opinions by cluster, concatenate text with type labels. */
function buildOpinionData(rows: OpinionRow[], clusterDateFiled: string): OpinionData {
  const url = rows[0].download_url || '';
  const fullUrl = url.startsWith('http') ? url : url ? `${CL_BASE_URL}${url}` : '';

  let combinedText: string;
  if (rows.length === 1) {
    combinedText = rows[0].plain_text;
  } else {
    combinedText = rows
      .map((op) => {
        const label = OPINION_TYPE_LABELS[op.type] ?? op.type;
        return `[${label}]\n${op.plain_text}`;
      })
      .join('\n\n');
  }
  return { text: combinedText, dateFiled: clusterDateFiled, opinionUrl: fullUrl };
}

// ---------------------------------------------------------------------------
// Local opinion text lookup (replaces API fetchOpinionText)
// ---------------------------------------------------------------------------

/**
 * Look up opinion text from the local staging DB instead of the CL API.
 * Drop-in replacement for fetchOpinionText() — same return type (OpinionData | null).
 * Eliminates rate limiting and returns full text (no 8KB API truncation).
 */
export async function fetchOpinionTextFromDb(docketId: number): Promise<OpinionData | null> {
  try {
    const pool = getPool();
    const result = await pool.query(
      `SELECT o.id AS opinion_id, o.type, o.plain_text,
              oc.id AS cluster_id, oc.date_filed::text AS cluster_date, oc.slug AS cluster_slug
       FROM search_opinion o
       JOIN search_opinioncluster oc ON o.cluster_id = oc.id
       WHERE oc.docket_id = $1
       ORDER BY oc.date_filed DESC, o.id`,
      [docketId],
    );
    if (result.rows.length === 0) return null;

    const rows: OpinionRow[] = [];
    for (const r of result.rows) {
      const opType = r.type || '010combined';
      if (PROCEDURAL_OPINION_TYPES.has(opType)) continue;
      const cleaned = (r.plain_text || '').replace(/\0/g, '');
      if (!cleaned) continue;
      rows.push({ type: opType, plain_text: cleaned, download_url: r.download_url || '' });
    }
    if (rows.length === 0) return null;

    // CL opinion URLs use the cluster ID + slug: /opinion/{cluster_id}/{slug}/
    const first = result.rows[0];
    const opinionUrl = `${CL_BASE_URL}/opinion/${first.cluster_id}/${first.cluster_slug || ''}/`;
    const opData = buildOpinionData(rows, first.cluster_date);
    return { ...opData, opinionUrl };
  } catch (err) {
    console.warn(`[cl-bulk] fetchOpinionTextFromDb(${docketId}) failed:`, err);
    return null;
  }
}

/** Check if the opinion staging table is loaded and usable. */
export async function isBulkOpinionDbAvailable(): Promise<boolean> {
  try {
    const r = await getPool().query(`SELECT 1 FROM search_opinion LIMIT 1`);
    return r.rows.length > 0;
  } catch {
    // Missing table is expected when staging isn't loaded on this environment
    console.debug('[cl-bulk] Opinion staging not available — using CL API fallback');
    return false;
  }
}

/** Get categories for a matched row, including opinion-text routing. */
export function routeMatchedDocket(row: MatchedDocketRow): string[] {
  const categories = routeDocket(row.nature_of_suit, row.case_name, row.cause);
  if (row.matched_opinion_text && !categories.includes('civilLiberties')) {
    categories.push('civilLiberties');
  }
  return categories;
}

/** Build ContentItems for a single matched docket row. */
function buildItemsForDocket(
  row: MatchedDocketRow,
  opinionsByCluster: Map<number, OpinionRow[]>,
): import('@/lib/types').ContentItem[] {
  const docketUrl = `${CL_BASE_URL}/docket/${row.docket_id}/${row.slug}/`;
  const docketItem = toContentItem({
    docket_id: row.docket_id,
    docket_absolute_url: docketUrl,
    caseName: row.case_name,
    dateFiled: row.docket_date_filed,
    court: row.court_name,
    suitNature: row.nature_of_suit,
    cause: row.cause,
    docketNumber: row.docket_number,
  });

  if (!row.cluster_id) return [docketItem];
  const opinions = opinionsByCluster.get(row.cluster_id);
  if (!opinions || opinions.length === 0) return [docketItem];

  const opData = buildOpinionData(opinions, row.cluster_date_filed!);
  if (row.docket_date_filed && opData.dateFiled < row.docket_date_filed) {
    return [docketItem];
  }

  const opinionItem = buildOpinionContentItem(opData, {
    caseName: row.case_name,
    court: row.court_name,
    docketId: row.docket_id,
    suitNature: row.nature_of_suit || undefined,
  });
  return [docketItem, opinionItem];
}

/** Query matched data, build ContentItems, and store via storeDocuments. */
export async function buildAndStoreDocuments(
  years: number[],
  dryRun: boolean,
): Promise<BulkPipelineResult> {
  const matched = await queryMatchedDockets(years);

  // Load opinions if staging table exists
  const opinionsByCluster = new Map<number, OpinionRow[]>();
  try {
    const clusterIds = [...new Set(matched.map((r) => r.cluster_id).filter(Boolean))];
    if (clusterIds.length > 0) {
      const opResult = await getPool().query(
        `SELECT cluster_id, type, plain_text, download_url
         FROM search_opinion WHERE cluster_id = ANY($1)`,
        [clusterIds],
      );
      for (const row of opResult.rows) {
        const opType = row.type || '010combined';
        if (PROCEDURAL_OPINION_TYPES.has(opType)) continue;
        const cleaned = (row.plain_text || '').replace(/\0/g, '');
        if (!cleaned) continue;
        const list = opinionsByCluster.get(row.cluster_id) || [];
        list.push({ type: opType, plain_text: cleaned, download_url: row.download_url || '' });
        opinionsByCluster.set(row.cluster_id, list);
      }
    }
    console.log(`[cl-bulk] Opinions loaded for ${opinionsByCluster.size} clusters`);
  } catch {
    console.log('[cl-bulk] No opinions staging table — storing docket items only');
  }

  let stored = 0;
  for (let i = 0; i < matched.length; i++) {
    if ((i + 1) % 1000 === 0) {
      console.log(`[cl-bulk] Storing: ${i + 1}/${matched.length} dockets, ${stored} docs`);
    }
    const row = matched[i];
    const items = buildItemsForDocket(row, opinionsByCluster);
    for (const category of routeMatchedDocket(row)) {
      stored += dryRun ? items.length : await storeDocuments(items, category);
    }
  }

  console.log(`[cl-bulk] Store complete: ${stored} documents ${dryRun ? '(dry run)' : 'stored'}`);
  logMemory('after store');
  return {
    docketsMatched: matched.length,
    clustersMatched: opinionsByCluster.size,
    opinionsMatched: opinionsByCluster.size,
    documentsStored: stored,
  };
}

// ---------------------------------------------------------------------------
// Query stats (for --query flag)
// ---------------------------------------------------------------------------

export async function queryStagingStats(years: number[]): Promise<void> {
  const matched = await queryMatchedDockets(years);
  const categories: Record<string, number> = {};
  for (const row of matched) {
    for (const cat of routeMatchedDocket(row)) categories[cat] = (categories[cat] || 0) + 1;
  }

  console.log('\n[cl-bulk] === Staging Query Stats ===');
  console.log(`  Matched dockets:  ${matched.length}`);
  const withClusters = matched.filter((r) => r.cluster_id != null);
  console.log(`  With clusters:    ${withClusters.length}`);
  for (const [cat, count] of Object.entries(categories).sort()) {
    console.log(`  ${cat}: ${count} dockets`);
  }

  try {
    const opCount = await getPool().query(`SELECT count(*) FROM search_opinion`);
    console.log(`  Staged opinions:  ${opCount.rows[0].count}`);
  } catch {
    console.log('  Staged opinions:  (table not loaded)');
  }
}

// ---------------------------------------------------------------------------
// Opinion-first backfill: find opinions by issue date, store with parent docket
// ---------------------------------------------------------------------------

/**
 * Find opinions issued in a date range (regardless of when the docket was filed),
 * build both docket + opinion ContentItems, and store them.
 *
 * This fills the gap where our docket-first pipeline misses opinions for older
 * cases. A case filed in 2015 with an opinion issued in 2017 would be missed
 * by the docket-first approach but captured here.
 */
/** A cluster matched by the opinion-first bulk query, tracking why (for routing, #555). */
interface BulkMatchedCluster {
  docket: Record<string, unknown>;
  opinions: OpinionRow[];
  /** Matched the original NOS / first-amendment branch (docket-routed). */
  baseMatch: boolean;
  /** COURT_QUERIES keys that matched (content-routed branch; provenance markers). */
  courtQueries: Set<string>;
}

/**
 * Query opinion clusters issued in a date range, with parent docket and opinion
 * text. Matches the same layers as the CL API path (cl-opinion-first-fetcher):
 * the NOS/first-amendment base branch, plus the court-scoped branches (#555) —
 * every SCOTUS opinion, and circuit/D.D.C. opinions whose text matches the
 * executive-power phrases.
 */
async function queryOpinionsByDate(
  from: string,
  to: string,
): Promise<Map<number, BulkMatchedCluster>> {
  const docketText = `(COALESCE(d.case_name,'') || ' ' || COALESCE(d.cause,''))`;
  const baseMatchSql = `(substring(d.nature_of_suit FROM '^\\d{3}') IN ('440', '530', '890')
         OR (${docketText} ~* ${FIRST_AMENDMENT_RE}
             AND ${docketText} ~* ${FIRST_AMENDMENT_QUALIFIERS})
         OR o.plain_text ~* ${FIRST_AMENDMENT_RE})`;
  const scotusMatchSql = `(d.court_id = 'scotus')`;
  const circuitsMatchSql = `(d.court_id IN (${CIRCUIT_COURT_ID_SQL}) AND o.plain_text ~* ${EXEC_POWER_RE})`;
  const dcdMatchSql = `(d.court_id = 'dcd' AND o.plain_text ~* ${EXEC_POWER_RE})`;

  const result = await getPool().query(
    `SELECT d.id AS docket_id, COALESCE(d.case_name, '(untitled case)') AS case_name,
       COALESCE(ct.full_name, d.court_id) AS court_name,
       COALESCE(d.nature_of_suit, '') AS nature_of_suit,
       COALESCE(d.cause, '') AS cause, COALESCE(d.docket_number, '') AS docket_number,
       d.date_filed::text AS docket_date_filed, COALESCE(d.slug, '') AS slug,
       oc.id AS cluster_id, oc.date_filed::text AS cluster_date_filed,
       oc.slug AS cluster_slug, o.type AS opinion_type, o.plain_text, o.download_url,
       ${baseMatchSql} AS base_match,
       ${scotusMatchSql} AS scotus_match,
       ${circuitsMatchSql} AS circuits_match,
       ${dcdMatchSql} AS dcd_match
     FROM search_opinioncluster oc
     JOIN search_docket d ON oc.docket_id = d.id
     JOIN search_court ct ON d.court_id = ct.id
     JOIN search_opinion o ON o.cluster_id = oc.id
     WHERE ct.jurisdiction IN ('F', 'FD', 'FB')
       AND (${baseMatchSql} OR ${scotusMatchSql} OR ${circuitsMatchSql} OR ${dcdMatchSql})
       AND oc.date_filed >= $1 AND oc.date_filed <= $2
     ORDER BY oc.docket_id, oc.date_filed DESC, o.id`,
    [from, to],
  );

  const clusterMap = new Map<number, BulkMatchedCluster>();
  for (const row of result.rows) {
    let entry = clusterMap.get(row.cluster_id);
    if (!entry) {
      entry = { docket: row, opinions: [], baseMatch: false, courtQueries: new Set() };
      clusterMap.set(row.cluster_id, entry);
    }
    if (row.base_match) entry.baseMatch = true;
    if (row.scotus_match) entry.courtQueries.add('scotus-all');
    if (row.circuits_match) entry.courtQueries.add('circuits-exec');
    if (row.dcd_match) entry.courtQueries.add('dcd-exec');

    const opType = row.opinion_type || '010combined';
    if (PROCEDURAL_OPINION_TYPES.has(opType)) continue;
    const cleaned = (row.plain_text || '').replace(/\0/g, '');
    if (!cleaned) continue;
    entry.opinions.push({
      type: opType,
      plain_text: cleaned,
      download_url: row.download_url || '',
    });
  }
  for (const [clusterId, entry] of clusterMap) {
    if (entry.opinions.length === 0) clusterMap.delete(clusterId);
  }
  return clusterMap;
}

/**
 * Route a bulk-matched opinion cluster (#555). Base (NOS/first-amendment)
 * matches keep docket-based routing with the first-amendment text fallback;
 * court-scoped matches are content-routed via classifyOpinionToCategories and
 * gated — a court-only cluster that classifies to nothing is not stored
 * (mirrors routeMatchedCluster in cl-opinion-first-fetcher).
 */
export function routeBulkOpinionCluster(
  match: { baseMatch: boolean; courtQueries: ReadonlySet<string> },
  docket: { natureOfSuit: string; caseName: string; cause: string },
  opinionText: string,
): { baseCategories: string[]; courtCategories: string[] } {
  const baseCategories = match.baseMatch
    ? routeDocket(docket.natureOfSuit, docket.caseName, docket.cause)
    : [];
  if (match.baseMatch && baseCategories.length === 0 && /\bfirst amendment\b/i.test(opinionText)) {
    baseCategories.push('civilLiberties');
  }
  const courtCategories =
    match.courtQueries.size > 0
      ? classifyOpinionToCategories(docket.caseName, opinionText).filter(
          (c) => !baseCategories.includes(c),
        )
      : [];
  return { baseCategories, courtCategories };
}

/** Store opinion clusters: docket + opinion pairs for base matches; opinion-only
 *  for court-scoped categories (mirrors the API path, which has no docket row). */
function storeOpinionClusters(
  clusterMap: Map<number, BulkMatchedCluster>,
  dryRun: boolean,
): Promise<number> {
  let stored = 0;
  let processed = 0;
  const entries = [...clusterMap.entries()];

  return (async () => {
    for (const [clusterId, entry] of entries) {
      processed++;
      if (processed % 500 === 0) {
        console.log(`[cl-bulk] Storing: ${processed}/${entries.length} clusters, ${stored} docs`);
      }

      const r = entry.docket as Record<string, string>;
      const opData = buildOpinionData(entry.opinions, r.cluster_date_filed);
      const { baseCategories, courtCategories } = routeBulkOpinionCluster(
        entry,
        { natureOfSuit: r.nature_of_suit, caseName: r.case_name, cause: r.cause },
        opData.text,
      );
      if (baseCategories.length + courtCategories.length === 0) continue;

      const opinionUrl = `${CL_BASE_URL}/opinion/${clusterId}/${r.cluster_slug || ''}/`;
      const opinionItem = buildOpinionContentItem(
        { ...opData, opinionUrl },
        {
          caseName: r.case_name,
          court: r.court_name,
          docketId: parseInt(r.docket_id, 10),
          suitNature: r.nature_of_suit || undefined,
          clQueries: [...entry.courtQueries],
        },
      );

      if (baseCategories.length > 0) {
        const docketItem = toContentItem({
          docket_id: parseInt(r.docket_id, 10),
          docket_absolute_url: `${CL_BASE_URL}/docket/${r.docket_id}/${r.slug}/`,
          caseName: r.case_name,
          dateFiled: r.docket_date_filed,
          court: r.court_name,
          suitNature: r.nature_of_suit,
          cause: r.cause,
          docketNumber: r.docket_number,
        });
        for (const category of baseCategories) {
          stored += dryRun ? 2 : await storeDocuments([docketItem, opinionItem], category);
        }
      }
      for (const category of courtCategories) {
        stored += dryRun ? 1 : await storeDocuments([opinionItem], category);
      }
    }
    return stored;
  })();
}

export async function backfillOpinionsByDate(
  from: string,
  to: string,
  dryRun: boolean,
): Promise<{ docketsFound: number; opinionsStored: number }> {
  console.log(`[cl-bulk] Opinion-first backfill: ${from} → ${to}`);
  const clusterMap = await queryOpinionsByDate(from, to);
  const courtMatched = [...clusterMap.values()].filter((e) => e.courtQueries.size > 0).length;
  console.log(
    `[cl-bulk] ${clusterMap.size} unique opinion clusters to store (${courtMatched} court-scoped)`,
  );
  const stored = await storeOpinionClusters(clusterMap, dryRun);
  console.log(
    `[cl-bulk] Opinion-first complete: ${clusterMap.size} clusters, ${stored} docs ${dryRun ? '(dry run)' : 'stored'}`,
  );
  return { docketsFound: clusterMap.size, opinionsStored: stored };
}

/**
 * Try the opinion-first pass if staging tables are available. No-op otherwise.
 * Single entry point for backfill, snapshot, and backfill:opinions.
 */
export async function tryOpinionFirstPass(
  from: string,
  to: string,
  dryRun: boolean,
): Promise<{ docketsFound: number; opinionsStored: number }> {
  if (!(await isBulkOpinionDbAvailable())) return { docketsFound: 0, opinionsStored: 0 };
  return backfillOpinionsByDate(from, to, dryRun);
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

export async function dropStagingTables(): Promise<void> {
  const pool = getPool();
  for (const table of STAGING_TABLES) {
    await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }
  console.log('[cl-bulk] Staging tables dropped');
}
