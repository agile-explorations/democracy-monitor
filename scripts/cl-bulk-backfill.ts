/**
 * CourtListener bulk data backfill — database staging approach.
 *
 * Usage:
 *   pnpm cl:bulk-backfill --download                        Print download instructions
 *   pnpm cl:bulk-backfill --load                            Load CSVs into staging tables
 *   pnpm cl:bulk-backfill --load-opinions --years 2023      Filter + load matched opinions
 *   pnpm cl:bulk-backfill --query --years 2023              Print matched docket stats
 *   pnpm cl:bulk-backfill --store --years 2023              Build + store documents
 *   pnpm cl:bulk-backfill --process --years 2023            All-in-one: load → opinions → store
 *   pnpm cl:bulk-backfill --drop-staging                    Drop staging tables
 *   pnpm cl:bulk-backfill --validate --validate-year 2021   Compare staging vs DB
 */

import * as fs from 'fs';
import * as path from 'path';
import { isDbAvailable } from '@/lib/db';
import { findBulkFiles } from '@/lib/services/cl-bulk-pipeline';
import { checkHelp } from '@/lib/utils/cli-help';

const DEFAULT_DATA_DIR = 'data/cl-bulk';
const DEFAULT_YEARS = [2019, 2020, 2023, 2024];

interface CliArgs {
  download: boolean;
  load: boolean;
  loadOpinions: boolean;
  query: boolean;
  store: boolean;
  process: boolean;
  validate: boolean;
  dropStaging: boolean;
  years: number[];
  validateYear: number;
  dryRun: boolean;
  dataDir: string;
}

function parseArgs(): CliArgs {
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm cl:bulk-backfill [options]

Options:
  --download              Print bulk CSV download instructions
  --load                  Load courts/dockets/clusters into staging tables
  --load-opinions         Filter + load matched opinions into staging
  --query                 Print matched docket/cluster/category stats
  --store                 Build ContentItems from staging data and store
  --process               All-in-one: load → load-opinions → store
  --validate              Compare staging results vs DB for a known year
  --drop-staging          Drop all staging tables
  --years <list>          Comma-separated years (default: ${DEFAULT_YEARS.join(',')})
  --validate-year <year>  Year to validate against (default: 2021)
  --dry-run               Report counts without storing
  --data-dir <path>       Bulk CSV directory (default: ${DEFAULT_DATA_DIR})`,
  );

  const args: CliArgs = {
    download: false,
    load: false,
    loadOpinions: false,
    query: false,
    store: false,
    process: false,
    validate: false,
    dropStaging: false,
    years: DEFAULT_YEARS,
    validateYear: 2021,
    dryRun: false,
    dataDir: DEFAULT_DATA_DIR,
  };

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--download') args.download = true;
    else if (argv[i] === '--load') args.load = true;
    else if (argv[i] === '--load-opinions') args.loadOpinions = true;
    else if (argv[i] === '--query') args.query = true;
    else if (argv[i] === '--store') args.store = true;
    else if (argv[i] === '--process') args.process = true;
    else if (argv[i] === '--validate') args.validate = true;
    else if (argv[i] === '--drop-staging') args.dropStaging = true;
    else if (argv[i] === '--years') args.years = argv[++i].split(',').map(Number);
    else if (argv[i] === '--validate-year') args.validateYear = parseInt(argv[++i], 10);
    else if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--data-dir') args.dataDir = argv[++i];
  }

  const hasAction =
    args.download ||
    args.load ||
    args.loadOpinions ||
    args.query ||
    args.store ||
    args.process ||
    args.validate ||
    args.dropStaging;
  if (!hasAction) {
    console.error('ERROR: specify an action (--load, --process, --query, --store, etc.)');
    process.exit(1);
  }

  return args;
}

// ---------------------------------------------------------------------------
// Download instructions (unchanged from original)
// ---------------------------------------------------------------------------

const S3_BUCKET = 'https://com-courtlistener-storage.s3-us-west-2.amazonaws.com';

function printDownloadInstructions(dataDir: string): void {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log('[download] CourtListener bulk data download');
  console.log('[download] Find file URLs from:');
  console.log(`[download]   ${S3_BUCKET}/list.html?prefix=bulk-data/`);
  console.log('[download] Then download with curl, e.g.:');
  console.log(`[download]   curl -o ${dataDir}/courts-YYYY-MM-DD.csv.bz2 <URL>`);
  console.log(`[download]   curl -o ${dataDir}/dockets-YYYY-MM-DD.csv.bz2 <URL>`);
  console.log(`[download]   curl -o ${dataDir}/opinion-clusters-YYYY-MM-DD.csv.bz2 <URL>`);
  console.log(`[download]   curl -o ${dataDir}/opinions-YYYY-MM-DD.csv.bz2 <URL>`);
}

// ---------------------------------------------------------------------------
// Validate (compare staging query results against DB documents)
// ---------------------------------------------------------------------------

async function validateAgainstDb(dataDir: string, year: number): Promise<void> {
  const { queryMatchedDockets, closeStagingPool, routeMatchedDocket } =
    await import('@/lib/services/cl-bulk-staging');
  // routeMatchedDocket handles both NOS routing and opinion-text routing
  const { getDb } = await import('@/lib/db');
  const { documents } = await import('@/lib/db/schema');
  const { and, eq, gte, lt } = await import('drizzle-orm');

  console.log(`[cl-bulk] Validating staging results for ${year} against DB...`);
  const matched = await queryMatchedDockets([year]);

  // Build URL → category set from staging results
  const CL_BASE = 'https://www.courtlistener.com';
  const stagingUrls = new Map<string, Set<string>>();
  const addUrl = (url: string, cat: string) => {
    const s = stagingUrls.get(url) ?? new Set();
    s.add(cat);
    stagingUrls.set(url, s);
  };
  for (const row of matched) {
    const docketUrl = `${CL_BASE}/docket/${row.docket_id}/${row.slug}/`;
    for (const cat of routeMatchedDocket(row)) addUrl(docketUrl, cat);
  }

  // Load DB URLs for comparison
  const db = getDb();
  const dbRows = await db
    .select({ url: documents.url, category: documents.category })
    .from(documents)
    .where(
      and(
        eq(documents.sourceOrigin, 'courtlistener'),
        gte(documents.publishedAt, new Date(`${year}-01-01`)),
        lt(documents.publishedAt, new Date(`${year + 1}-01-01`)),
      ),
    );
  const dbUrls = new Map<string, Set<string>>();
  for (const row of dbRows) {
    if (!row.url) continue;
    const s = dbUrls.get(row.url) ?? new Set();
    s.add(row.category);
    dbUrls.set(row.url, s);
  }

  let inBoth = 0,
    stagingOnly = 0,
    dbOnly = 0;
  for (const [url, cats] of stagingUrls) {
    if (dbUrls.has(url)) inBoth += cats.size;
    else stagingOnly += cats.size;
  }
  for (const [url, cats] of dbUrls) {
    if (!stagingUrls.has(url)) dbOnly += cats.size;
  }

  console.log(`\n[cl-bulk] === Validation Report for ${year} ===`);
  console.log(`  Staging URLs: ${stagingUrls.size} unique`);
  console.log(`  DB URLs:      ${dbUrls.size} unique`);
  console.log(`  In both:      ${inBoth} (url+category pairs)`);
  console.log(`  Staging only: ${stagingOnly} (new documents staging would add)`);
  console.log(`  DB only:      ${dbOnly} (documents staging missed)`);

  if (dbOnly > 0) {
    const samples = [...dbUrls.keys()].filter((u) => !stagingUrls.has(u)).slice(0, 10);
    console.log(`\n  Sample DB-only URLs:`);
    for (const url of samples) console.log(`    ${url}`);
  }

  await closeStagingPool();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs();

  if (args.download) {
    printDownloadInstructions(args.dataDir);
    return;
  }

  if (!isDbAvailable()) {
    console.error('ERROR: DATABASE_URL not configured');
    process.exit(1);
  }

  // Lazy import to avoid loading DB modules until needed
  const staging = await import('@/lib/services/cl-bulk-staging');

  try {
    if (args.process) {
      // All-in-one: load → load-opinions → store
      await staging.loadBaseStagingData(args.dataDir);

      const files = findBulkFiles(args.dataDir, { opinionsOptional: true });
      if (files.opinions) {
        await staging.loadOpinions(files.opinions);
      } else {
        console.log('[cl-bulk] No opinions file found — skipping opinion loading');
      }

      const result = await staging.buildAndStoreDocuments(args.years, args.dryRun);
      printSummary(result, args.dryRun);
      return;
    }

    if (args.load) await staging.loadBaseStagingData(args.dataDir);

    if (args.loadOpinions) {
      const files = findBulkFiles(args.dataDir, { opinionsOptional: true });
      if (!files.opinions) {
        console.error('ERROR: No opinions file found in', args.dataDir);
        process.exit(1);
      }
      await staging.loadOpinions(files.opinions);
    }

    if (args.query) await staging.queryStagingStats(args.years);

    if (args.store) {
      const result = await staging.buildAndStoreDocuments(args.years, args.dryRun);
      printSummary(result, args.dryRun);
    }

    if (args.validate) {
      await validateAgainstDb(args.dataDir, args.validateYear);
    }

    if (args.dropStaging) await staging.dropStagingTables();
  } finally {
    await staging.closeStagingPool();
  }
}

function printSummary(
  result: import('@/lib/services/cl-bulk-pipeline').BulkPipelineResult,
  dryRun: boolean,
): void {
  console.log(`\n[cl-bulk] === Summary ${dryRun ? '(DRY RUN) ' : ''}===`);
  console.log(`  Dockets matched:   ${result.docketsMatched}`);
  console.log(`  Clusters matched:  ${result.clustersMatched}`);
  console.log(`  Opinions matched:  ${result.opinionsMatched}`);
  console.log(`  Documents stored:  ${result.documentsStored}`);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  main().catch((err) => {
    console.error('[cl-bulk] Fatal:', err);
    process.exit(1);
  });
}
