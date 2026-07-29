/**
 * CLI: pnpm backfill:dhs-oig -- --from YYYY-MM-DD --to YYYY-MM-DD [--dry-run] [--skip-content]
 *
 * One-shot bulk backfill for DHS OIG (#602). The DHS listings expose no date
 * query filter, so the per-week backfill loop would re-walk the archive from
 * page 0 for every week (~14 hours of listing requests for 2017→now). This
 * driver walks each listing ONCE for the whole range, extracts each PDF once,
 * and stores the same items to both categories (executiveOversight = all,
 * immigrationEnforcement = title-filtered subset) — no duplicate PDF fetches.
 *
 * Embeddings, scoring, and aggregation are deliberately left to the standard
 * runbook commands (embeddings:backfill, scores:backfill, aggregates).
 */

import { fillOigContent } from '@/lib/cron/backfill-fetchers';
import { fetchDhsOigHistorical, isImmigrationContentItem } from '@/lib/services/dhs-oig-fetcher';
import { storeDocuments } from '@/lib/services/document-store';
import { recordFetchResult } from '@/lib/services/fetch-log-store';
import type { ContentItem } from '@/lib/types';
import { checkHelp } from '@/lib/utils/cli-help';
import { getWeekRanges } from '@/lib/utils/date-utils';

const CONTENT_FLOOR_CHARS = 100;

interface DhsBackfillOptions {
  from: string;
  to: string;
  dryRun: boolean;
  skipContent: boolean;
}

function summarizeByYear(items: ContentItem[]): void {
  const byYear = new Map<string, number>();
  for (const item of items) {
    const year = (item.pubDate ?? '').slice(0, 4) || 'undated';
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }
  for (const [year, count] of [...byYear.entries()].sort()) {
    console.log(`  ${year}: ${count}`);
  }
}

function reportExtraction(items: ContentItem[]): void {
  const extracted = items.filter((i) => (i.content?.length ?? 0) >= CONTENT_FLOOR_CHARS);
  const subFloor = items.filter((i) => (i.content?.length ?? 0) < CONTENT_FLOOR_CHARS);
  const lengths = extracted.map((i) => i.content!.length).sort((a, b) => a - b);
  const median = lengths.length > 0 ? lengths[Math.floor(lengths.length / 2)] : 0;

  console.log(
    `\n[dhs-oig] Extraction: ${extracted.length}/${items.length} ≥${CONTENT_FLOOR_CHARS} chars (median ${median})`,
  );
  if (subFloor.length > 0) {
    console.log(`[dhs-oig] Sub-floor items (${subFloor.length}):`);
    for (const i of subFloor) {
      console.log(
        `  - ${(i.pubDate ?? '').slice(0, 10)} ${i.content?.length ?? 0} chars | ${(i.title ?? '').slice(0, 80)} | ${i.link}`,
      );
    }
  }
}

/**
 * Mark immigrationEnforcement weeks complete in fetch_log so validate:ingest
 * and future per-week runs see OIG coverage. executiveOversight is deliberately
 * NOT logged: it already has (oig, category, week) rows from DOJ/HHS/SSA runs,
 * and the ledger upserts on that key — logging DHS-only counts would overwrite
 * the existing fetch-health history.
 */
async function logImmigrationWeeks(
  items: ContentItem[],
  storedCount: number,
  from: string,
  to: string,
): Promise<void> {
  const weeks = getWeekRanges(from, to);
  const byWeek = new Map<string, number>();
  for (const item of items) {
    const day = (item.pubDate ?? '').slice(0, 10);
    const week = weeks.find((w) => day >= w.start && day <= w.end);
    if (week) byWeek.set(week.start, (byWeek.get(week.start) ?? 0) + 1);
  }
  for (const week of weeks) {
    const fetched = byWeek.get(week.start) ?? 0;
    await recordFetchResult({
      sourceOrigin: 'oig',
      category: 'immigrationEnforcement',
      weekStart: week.start,
      weekEnd: week.end,
      itemsFetched: fetched,
      itemsStored: storedCount > 0 ? fetched : 0,
      errors: [],
    });
  }
}

async function runDhsOigBackfill(opts: DhsBackfillOptions): Promise<void> {
  console.log(
    `[dhs-oig] Bulk backfill ${opts.from} → ${opts.to}${opts.dryRun ? ' (dry-run)' : ''}`,
  );

  const items = await fetchDhsOigHistorical({ dateFrom: opts.from, dateTo: opts.to });
  const immigrationItems = items.filter(isImmigrationContentItem);
  console.log(
    `\n[dhs-oig] Fetched ${items.length} reports (${immigrationItems.length} immigration-related):`,
  );
  summarizeByYear(items);

  if (opts.dryRun) {
    console.log('\n[dhs-oig] Dry run — no content extraction, no writes');
    return;
  }

  if (!opts.skipContent) {
    console.log(
      `\n[dhs-oig] Extracting ${items.length} PDFs (~${Math.round((items.length * 7) / 60)} min at 5s politeness)...`,
    );
    await fillOigContent(items);
    reportExtraction(items);
  }

  const storedExec = await storeDocuments(items, 'executiveOversight');
  const storedImm = await storeDocuments(immigrationItems, 'immigrationEnforcement');
  console.log(
    `\n[dhs-oig] Stored: ${storedExec} executiveOversight, ${storedImm} immigrationEnforcement`,
  );

  await logImmigrationWeeks(immigrationItems, storedImm, opts.from, opts.to);
  console.log('[dhs-oig] fetch_log updated for immigrationEnforcement weeks');
}

function parseCliArgs(args: string[]): DhsBackfillOptions {
  const opts: DhsBackfillOptions = { from: '', to: '', dryRun: false, skipContent: false };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from') opts.from = args[++i];
    else if (args[i] === '--to') opts.to = args[++i];
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--skip-content') opts.skipContent = true;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.from) || !/^\d{4}-\d{2}-\d{2}$/.test(opts.to)) {
    throw new Error('--from and --to are required (YYYY-MM-DD)');
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm backfill:dhs-oig -- --from YYYY-MM-DD --to YYYY-MM-DD [options]

One-shot DHS OIG bulk backfill: single listing walk, one PDF pass, stores to
executiveOversight (all) + immigrationEnforcement (title-filtered subset).

Options:
  --from <date>    Start date (required)
  --to <date>      End date (required)
  --dry-run        Fetch listings and report counts; no PDFs, no writes
  --skip-content   Store listing metadata without PDF extraction`,
  );
  runDhsOigBackfill(parseCliArgs(argv))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[dhs-oig] Backfill failed:', err);
      process.exit(1);
    });
}
