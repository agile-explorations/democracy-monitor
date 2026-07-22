import { eq } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { legiscanDatasets } from '@/lib/db/schema';
import { finishCronRun, startCronRun } from '@/lib/services/cron-run-store';
import type { CronRunStatus } from '@/lib/services/cron-run-store';
import { storeDocuments } from '@/lib/services/document-store';
import {
  buildBillMetadata,
  classifyBill,
  fetchDataset,
  fetchDatasetList,
  isBillInDateRange,
  parseBillToContentItem,
} from '@/lib/services/legiscan-fetcher';
import type { LegiScanBill, LegiScanDatasetEntry } from '@/lib/services/legiscan-fetcher';
import type { ContentItem } from '@/lib/types';
import { formatError } from '@/lib/utils/api-helpers';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';
import { withCronLock } from '@/lib/utils/cron-lock';
import { toDateString } from '@/lib/utils/date-utils';

/** Baseline periods aligned to presidential administrations. */
const BASELINE_PERIODS: Array<{
  label: string;
  dateRange: { start: string; end: string };
}> = [
  {
    label: 'Trump T1',
    // Full term (#556): the original 2019-01-19 end left trump_2019/2020
    // with zero LegiScan coverage — the 116th Congress never matched.
    dateRange: { start: '2017-01-20', end: '2021-01-19' },
  },
  {
    label: 'Biden',
    // Full term (#556): ditto for biden_2023/2024 and the 118th Congress.
    dateRange: { start: '2021-01-20', end: '2025-01-19' },
  },
  {
    label: 'Trump T2',
    dateRange: { start: '2025-01-20', end: toDateString(new Date()) },
  },
];

interface BulkOptions {
  state: string;
  dryRun: boolean;
}

export interface LegiscanResult {
  sessionsProcessed: number;
  sessionsFailed: number;
  errors: string[];
}

/** Check if a session's dataset_hash has changed since last download. */
async function getStoredHash(sessionId: number): Promise<string | null> {
  if (!isDbAvailable()) return null;
  const db = getDb();
  const rows = await db
    .select({ datasetHash: legiscanDatasets.datasetHash })
    .from(legiscanDatasets)
    .where(eq(legiscanDatasets.sessionId, sessionId))
    .limit(1);
  return rows[0]?.datasetHash ?? null;
}

/** Record a successful dataset download in the tracking table. */
async function recordDatasetDownload(
  entry: LegiScanDatasetEntry,
  hash: string,
  billCount: number,
): Promise<void> {
  if (!isDbAvailable()) return;
  const db = getDb();

  await db
    .insert(legiscanDatasets)
    .values({
      sessionId: entry.session_id,
      state: entry.state_id.toString().padStart(2, '0').slice(0, 2),
      sessionName: entry.session_name,
      datasetHash: hash,
      datasetDate: entry.dataset_date ? new Date(entry.dataset_date) : null,
      downloadedAt: new Date(),
      billCount,
    })
    .onConflictDoUpdate({
      target: legiscanDatasets.sessionId,
      set: {
        datasetHash: hash,
        datasetDate: entry.dataset_date ? new Date(entry.dataset_date) : null,
        downloadedAt: new Date(),
        billCount,
      },
    });
}

/** Store bills matching a specific baseline period into the documents table. */
function storeBillsForBaseline(
  bills: LegiScanBill[],
  baseline: (typeof BASELINE_PERIODS)[number],
): Promise<{ bills: number; stored: number; categories: Record<string, number> }> {
  return storeBillsInRange(bills, baseline.dateRange.start, baseline.dateRange.end, baseline.label);
}

async function storeBillsInRange(
  bills: LegiScanBill[],
  rangeStart: string,
  rangeEnd: string,
  label: string,
): Promise<{ bills: number; stored: number; categories: Record<string, number> }> {
  const filtered = bills.filter((b) => isBillInDateRange(b, rangeStart, rangeEnd));
  console.log(`    [${label}] ${filtered.length} bills within ${rangeStart} → ${rangeEnd}`);

  let totalStored = 0;
  const categoryCounts: Record<string, number> = {};

  for (const bill of filtered) {
    const categories = classifyBill(bill);
    if (categories.length === 0) continue;

    const baseItem = parseBillToContentItem(bill);
    const metadata = buildBillMetadata(bill);

    for (const category of categories) {
      const item: ContentItem = { ...baseItem, metadata };
      const stored = await storeDocuments([item], category);
      totalStored += stored;
      categoryCounts[category] = (categoryCounts[category] || 0) + stored;
    }
  }

  console.log(
    `    [${label}] Stored ${totalStored} rows across ${Object.keys(categoryCounts).length} categories`,
  );

  return { bills: filtered.length, stored: totalStored, categories: categoryCounts };
}

/** Find all baseline periods that overlap with a session's year range. */
function matchSessionToBaselines(entry: LegiScanDatasetEntry): (typeof BASELINE_PERIODS)[number][] {
  if (entry.special !== 0) return [];

  const sessionStartYear = entry.year_start;
  const sessionEndYear = entry.year_end;

  return BASELINE_PERIODS.filter((b) => {
    const baselineStartYear = parseInt(b.dateRange.start.slice(0, 4));
    const baselineEndYear = parseInt(b.dateRange.end.slice(0, 4));
    return sessionStartYear <= baselineEndYear && sessionEndYear >= baselineStartYear;
  });
}

type SessionMatch = {
  entry: LegiScanDatasetEntry;
  baselines: (typeof BASELINE_PERIODS)[number][];
};

/** Build a map of sessions to their overlapping baseline periods. */
function buildSessionBaselineMap(datasets: LegiScanDatasetEntry[]): Map<number, SessionMatch> {
  const result = new Map<number, SessionMatch>();
  for (const entry of datasets) {
    const baselines = matchSessionToBaselines(entry);
    if (baselines.length > 0) {
      result.set(entry.session_id, { entry, baselines });
    }
  }
  return result;
}

/** Download one session and store bills for each matching baseline period. */
async function downloadAndProcessSession(
  { entry, baselines }: SessionMatch,
  dryRun: boolean,
): Promise<{ bills: number; stored: number; categories: Record<string, number> }> {
  console.log(`\n  Session: ${entry.session_name} (id=${entry.session_id})`);

  const storedHash = await getStoredHash(entry.session_id);
  if (storedHash === entry.dataset_hash) {
    console.log(`    Skipped: dataset_hash unchanged (${entry.dataset_hash})`);
    return { bills: 0, stored: 0, categories: {} };
  }

  if (dryRun) {
    console.log(`    [DRY RUN] Would download dataset (${entry.dataset_size} bytes)`);
    for (const b of baselines) {
      console.log(
        `    [DRY RUN] Would process for ${b.label}: ${b.dateRange.start} → ${b.dateRange.end}`,
      );
    }
    return { bills: 0, stored: 0, categories: {} };
  }

  console.log(`    Downloading dataset (${(entry.dataset_size / 1024 / 1024).toFixed(1)} MB)...`);
  const { bills, hash } = await fetchDataset(entry.session_id, entry.access_key);
  console.log(`    Extracted ${bills.length} bills from ZIP`);

  let totalBills = 0;
  let totalStored = 0;
  const categories: Record<string, number> = {};

  for (const baseline of baselines) {
    const result = await storeBillsForBaseline(bills, baseline);
    totalBills += result.bills;
    totalStored += result.stored;
    for (const [cat, count] of Object.entries(result.categories)) {
      categories[cat] = (categories[cat] || 0) + count;
    }
  }

  await recordDatasetDownload(entry, hash, totalBills);
  return { bills: totalBills, stored: totalStored, categories };
}

/** Backfill LegiScan bills for a specific date range. Called by pnpm backfill --source legiscan. */
export async function backfillLegiscan(
  from: string,
  to: string,
  dryRun: boolean,
  state = 'US',
): Promise<number> {
  console.log(`\n[backfill] === LegiScan (${from} → ${to}) ===`);

  const datasets = await fetchDatasetList(state);
  const sessionMap = buildSessionBaselineMap(datasets);
  console.log(`[backfill] ${sessionMap.size} sessions matched baseline periods`);

  let totalStored = 0;
  for (const match of sessionMap.values()) {
    if (dryRun) {
      console.log(`  [DRY RUN] Would process ${match.entry.session_name}`);
      continue;
    }

    const storedHash = await getStoredHash(match.entry.session_id);
    if (storedHash === match.entry.dataset_hash) {
      console.log(`  ${match.entry.session_name}: skipped (unchanged)`);
      continue;
    }

    console.log(`  Downloading ${match.entry.session_name}...`);
    const { bills, hash } = await fetchDataset(match.entry.session_id, match.entry.access_key);
    const result = await storeBillsInRange(bills, from, to, 'backfill');
    totalStored += result.stored;
    await recordDatasetDownload(match.entry, hash, result.bills);
    if (result.stored > 0) await sleep(1000);
  }

  console.log(`[backfill] LegiScan: ${totalStored} document rows stored`);
  return totalStored;
}

/** Process all sessions, accumulating stats and errors. */
async function processSessions(
  sessionMap: Map<number, SessionMatch>,
  dryRun: boolean,
): Promise<{
  totalBills: number;
  totalStored: number;
  allCategories: Record<string, number>;
  sessionsFailed: number;
  errors: string[];
}> {
  let totalBills = 0;
  let totalStored = 0;
  const allCategories: Record<string, number> = {};
  let sessionsFailed = 0;
  const errors: string[] = [];

  for (const match of sessionMap.values()) {
    try {
      const result = await downloadAndProcessSession(match, dryRun);
      totalBills += result.bills;
      totalStored += result.stored;
      for (const [cat, count] of Object.entries(result.categories)) {
        allCategories[cat] = (allCategories[cat] || 0) + count;
      }
      if (!dryRun && result.stored > 0) await sleep(1000);
    } catch (err) {
      sessionsFailed++;
      errors.push(`Session ${match.entry.session_name} failed: ${formatError(err)}`);
      console.error(`[legiscan-bulk] Session ${match.entry.session_name} failed:`, err);
    }
  }

  return { totalBills, totalStored, allCategories, sessionsFailed, errors };
}

export async function runLegiscanBulk(options: BulkOptions): Promise<LegiscanResult> {
  if (!process.env.LEGISCAN_API_KEY) {
    throw new Error('LEGISCAN_API_KEY is required');
  }

  const cronRunId = await startCronRun('legiscan');
  const { state, dryRun } = options;
  console.log(
    `[legiscan-bulk] ${dryRun ? '(DRY RUN) ' : ''}Fetching dataset list for state=${state}`,
  );

  const datasets = await fetchDatasetList(state);
  console.log(`[legiscan-bulk] Found ${datasets.length} available sessions`);

  const sessionMap = buildSessionBaselineMap(datasets);
  const pairCount = [...sessionMap.values()].reduce((s, m) => s + m.baselines.length, 0);
  console.log(`[legiscan-bulk] Matched ${sessionMap.size} sessions (${pairCount} baseline pairs):`);
  for (const { entry, baselines } of sessionMap.values()) {
    console.log(
      `  - ${entry.session_name} (id=${entry.session_id}): ${baselines.map((b) => b.label).join(', ')}`,
    );
  }

  if (sessionMap.size === 0) {
    console.log('[legiscan-bulk] No matching sessions found. Check state parameter.');
    try {
      await finishCronRun(cronRunId, 'success', { sessionsProcessed: 0 }, []);
    } catch (err) {
      console.error('[legiscan-bulk] Failed to record cron run:', err);
    }
    return { sessionsProcessed: 0, sessionsFailed: 0, errors: [] };
  }

  const { totalBills, totalStored, allCategories, sessionsFailed, errors } = await processSessions(
    sessionMap,
    dryRun,
  );

  console.log('\n[legiscan-bulk] === Summary ===');
  console.log(`  Sessions: ${sessionMap.size} (${sessionsFailed} failed)`);
  console.log(`  Bills: ${totalBills}, stored: ${totalStored}`);

  let cronStatus: CronRunStatus;
  if (sessionsFailed === 0) cronStatus = 'success';
  else if (sessionsFailed < sessionMap.size) cronStatus = 'partial';
  else cronStatus = 'failed';

  try {
    await finishCronRun(
      cronRunId,
      cronStatus,
      {
        sessionsProcessed: sessionMap.size,
        sessionsFailed,
        billsStored: totalStored,
        categoryDistribution: allCategories,
      },
      errors,
    );
  } catch (err) {
    console.error('[legiscan-bulk] Failed to record cron run:', err);
  }

  return { sessionsProcessed: sessionMap.size, sessionsFailed, errors };
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm legiscan:bulk [options]

Options:
  --state <code>      State code (default: US)
  --dry-run           Preview without writing to DB`,
  );
  const options: BulkOptions = { state: 'US', dryRun: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--state':
        options.state = args[++i];
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
    }
  }

  let legiscanResult: LegiscanResult | undefined;
  withCronLock('legiscan', async () => {
    legiscanResult = await runLegiscanBulk(options);
  })
    .then((ran) => {
      if (!ran) process.exit(2);
      process.exit(legiscanResult && legiscanResult.sessionsFailed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('[legiscan-bulk] Fatal error:', err);
      process.exit(1);
    });
}
