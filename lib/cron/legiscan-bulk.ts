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
import type { LegiScanDatasetEntry } from '@/lib/services/legiscan-fetcher';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { toDateString } from '@/lib/utils/date-utils';

/**
 * Target Congress sessions mapped to baseline periods.
 * year_start identifies the Congress number from the getDatasetList response.
 */
const TARGET_SESSIONS: Array<{
  label: string;
  congressNumber: number;
  yearStart: number;
  dateRange: { start: string; end: string };
}> = [
  {
    label: '115th Congress (Trump T1)',
    congressNumber: 115,
    yearStart: 2017,
    dateRange: { start: '2017-01-20', end: '2019-01-19' },
  },
  {
    label: '117th Congress (Biden)',
    congressNumber: 117,
    yearStart: 2021,
    dateRange: { start: '2021-01-20', end: '2023-01-19' },
  },
  {
    label: '119th Congress (Trump T2)',
    congressNumber: 119,
    yearStart: 2025,
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

async function processSession(
  entry: LegiScanDatasetEntry,
  target: (typeof TARGET_SESSIONS)[number],
  dryRun: boolean,
): Promise<{ bills: number; stored: number; categories: Record<string, number> }> {
  console.log(`\n  [${target.label}] session_id=${entry.session_id}`);
  console.log(`    Date range: ${target.dateRange.start} → ${target.dateRange.end}`);

  // Check hash to avoid duplicate downloads
  const storedHash = await getStoredHash(entry.session_id);
  if (storedHash === entry.dataset_hash) {
    console.log(`    Skipped: dataset_hash unchanged (${entry.dataset_hash})`);
    return { bills: 0, stored: 0, categories: {} };
  }

  if (dryRun) {
    console.log(`    [DRY RUN] Would download dataset (${entry.dataset_size} bytes)`);
    return { bills: 0, stored: 0, categories: {} };
  }

  console.log(`    Downloading dataset (${(entry.dataset_size / 1024 / 1024).toFixed(1)} MB)...`);
  const { bills, hash } = await fetchDataset(entry.session_id, entry.access_key);
  console.log(`    Extracted ${bills.length} bills from ZIP`);

  // Filter by date range
  const filtered = bills.filter((b) =>
    isBillInDateRange(b, target.dateRange.start, target.dateRange.end),
  );
  console.log(`    ${filtered.length} bills within date range`);

  let totalStored = 0;
  const categoryCounts: Record<string, number> = {};

  for (const bill of filtered) {
    const categories = classifyBill(bill);
    if (categories.length === 0) continue;

    const baseItem = parseBillToContentItem(bill);
    const metadata = buildBillMetadata(bill);

    // Store once per matching category
    for (const category of categories) {
      const item: ContentItem = { ...baseItem, ...{ metadata } };
      const stored = await storeDocuments([item], category);
      totalStored += stored;
      categoryCounts[category] = (categoryCounts[category] || 0) + stored;
    }
  }

  console.log(
    `    Stored ${totalStored} document rows across ${Object.keys(categoryCounts).length} categories`,
  );

  await recordDatasetDownload(entry, hash, filtered.length);

  return { bills: filtered.length, stored: totalStored, categories: categoryCounts };
}

function matchSessionToTarget(
  entry: LegiScanDatasetEntry,
): (typeof TARGET_SESSIONS)[number] | null {
  // Match by year_start; skip special sessions
  if (entry.special !== 0) return null;
  return TARGET_SESSIONS.find((t) => t.yearStart === entry.year_start) ?? null;
}

export async function runLegiscanBulk(options: BulkOptions): Promise<void> {
  const { state, dryRun } = options;

  console.log(
    `[legiscan-bulk] ${dryRun ? '(DRY RUN) ' : ''}Fetching dataset list for state=${state}`,
  );

  const datasets = await fetchDatasetList(state);
  console.log(`[legiscan-bulk] Found ${datasets.length} available sessions`);

  const matched: Array<{
    entry: LegiScanDatasetEntry;
    target: (typeof TARGET_SESSIONS)[number];
  }> = [];

  for (const entry of datasets) {
    const target = matchSessionToTarget(entry);
    if (target) {
      matched.push({ entry, target });
    }
  }

  console.log(`[legiscan-bulk] Matched ${matched.length} target sessions:`);
  for (const { target, entry } of matched) {
    console.log(`  - ${target.label}: session_id=${entry.session_id}, hash=${entry.dataset_hash}`);
  }

  if (matched.length === 0) {
    console.log('[legiscan-bulk] No matching sessions found. Check state parameter.');
    return;
  }

  let totalBills = 0;
  let totalStored = 0;
  const allCategories: Record<string, number> = {};

  for (const { entry, target } of matched) {
    const result = await processSession(entry, target, dryRun);
    totalBills += result.bills;
    totalStored += result.stored;
    for (const [cat, count] of Object.entries(result.categories)) {
      allCategories[cat] = (allCategories[cat] || 0) + count;
    }

    // Rate limit between session downloads
    if (!dryRun) await sleep(1000);
  }

  console.log('\n[legiscan-bulk] === Summary ===');
  console.log(`  Sessions processed: ${matched.length}`);
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
