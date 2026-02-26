import { eq } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { legiscanDatasets } from '@/lib/db/schema';
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
import { sleep } from '@/lib/utils/async';
import { toDateString } from '@/lib/utils/date-utils';

/** Baseline periods aligned to presidential administrations. */
const BASELINE_PERIODS: Array<{
  label: string;
  dateRange: { start: string; end: string };
}> = [
  {
    label: 'Trump T1',
    dateRange: { start: '2017-01-20', end: '2019-01-19' },
  },
  {
    label: 'Biden',
    dateRange: { start: '2021-01-20', end: '2023-01-19' },
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
function matchSessionToBaselines(
  entry: LegiScanDatasetEntry,
): (typeof BASELINE_PERIODS)[number][] {
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
function buildSessionBaselineMap(
  datasets: LegiScanDatasetEntry[],
): Map<number, SessionMatch> {
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
      console.log(`    [DRY RUN] Would process for ${b.label}: ${b.dateRange.start} → ${b.dateRange.end}`);
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

export async function runLegiscanBulk(options: BulkOptions): Promise<void> {
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
    return;
  }

  let totalBills = 0;
  let totalStored = 0;
  const allCategories: Record<string, number> = {};

  for (const match of sessionMap.values()) {
    const result = await downloadAndProcessSession(match, dryRun);
    totalBills += result.bills;
    totalStored += result.stored;
    for (const [cat, count] of Object.entries(result.categories)) {
      allCategories[cat] = (allCategories[cat] || 0) + count;
    }
    if (!dryRun && result.stored > 0) await sleep(1000);
  }

  console.log('\n[legiscan-bulk] === Summary ===');
  console.log(`  Sessions downloaded: ${sessionMap.size}`);
  console.log(`  Bills in date ranges: ${totalBills}`);
  console.log(`  Document rows stored: ${totalStored}`);
  if (Object.keys(allCategories).length > 0) {
    console.log('  Category distribution:');
    for (const [cat, count] of Object.entries(allCategories).sort((a, b) => b[1] - a[1])) {
      console.log(`    ${cat}: ${count}`);
    }
  }
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const args = process.argv.slice(2);
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

  runLegiscanBulk(options)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[legiscan-bulk] Fatal error:', err);
      process.exit(1);
    });
}
