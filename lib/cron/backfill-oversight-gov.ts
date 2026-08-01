/**
 * CLI: pnpm backfill:oversight-gov -- --from YYYY-MM-DD --to YYYY-MM-DD [options]
 *
 * One-shot bulk backfill for oversight.gov (CIGIE aggregator, #654). Unlike the
 * DHS driver, oversight.gov supports server-side date-range + submitting-OIG
 * facet queries, so the walk is windowed per signal × quarterly chunk — each
 * chunk is a natural resume checkpoint and no query exceeds ~65 listing pages.
 *
 * --dry-run reports per-signal counts plus the three-numbers spend precheck
 * (source-matched / net-new after URL anti-join / assessable estimate) — the
 * Gate-A approval artifact required by the AI spend protocol (#563/#564).
 *
 * Embeddings, scoring, and aggregation are deliberately left to the standard
 * runbook commands (embeddings:backfill, scores:backfill, aggregates).
 */

import { like, sql } from 'drizzle-orm';
import { fillOigContent } from '@/lib/cron/backfill-fetchers';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { storeDocuments } from '@/lib/services/document-store';
import { recordFetchResult } from '@/lib/services/fetch-log-store';
import {
  fetchOversightGovHistorical,
  parseOversightGovParams,
} from '@/lib/services/oversight-gov-fetcher';
import type { ContentItem } from '@/lib/types';
import { checkHelp } from '@/lib/utils/cli-help';
import { getWeekRanges } from '@/lib/utils/date-utils';

const CONTENT_FLOOR_CHARS = 100;
/** Extraction-success assumption for the assessable estimate (DHS-comparable). */
const ASSESSABLE_RATE = 0.95;

/**
 * Categories whose fetch_log rows this backfill may write. The ledger upserts
 * on (sourceOrigin='oig', category, weekStart); executiveOversight is
 * deliberately absent — DOJ/HHS/SSA/DHS already own those rows and logging
 * oversight.gov-only counts would overwrite their fetch-health history (see
 * backfill-dhs-oig.ts logImmigrationWeeks for the precedent).
 */
const FETCH_LOG_CATEGORIES: ReadonlyArray<string> = ['civilService', 'fiscal', 'elections'];

interface OversightSignal {
  id: string;
  url: string;
  category: string;
}

interface OversightBackfillOptions {
  from: string;
  to: string;
  signal?: string;
  dryRun: boolean;
  skipContent: boolean;
  skipExisting: boolean;
}

/** All oversight.gov signals, derived from the category definitions. */
export function oversightSignals(): OversightSignal[] {
  const signals: OversightSignal[] = [];
  for (const category of CATEGORIES) {
    for (const signal of category.signals) {
      if (signal.url.startsWith('oig://oversight')) {
        signals.push({ id: signal.id, url: signal.url, category: category.key });
      }
    }
  }
  return signals;
}

/** Split [from, to] into ~quarterly chunks (resume checkpoints, bounded queries). */
export function quarterChunks(from: string, to: string): Array<{ from: string; to: string }> {
  const chunks: Array<{ from: string; to: string }> = [];
  let start = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (start <= end) {
    const next = new Date(start);
    next.setUTCMonth(next.getUTCMonth() + 3);
    const chunkEnd = next <= end ? new Date(next.getTime() - 86_400_000) : end;
    chunks.push({
      from: start.toISOString().slice(0, 10),
      to: chunkEnd.toISOString().slice(0, 10),
    });
    start = next;
  }
  return chunks;
}

/** Map of (url|category) → stored content length for oversight.gov documents. */
async function loadExistingDocs(): Promise<Map<string, number>> {
  if (!isDbAvailable()) return new Map();
  const rows = await getDb()
    .select({
      url: documents.url,
      category: documents.category,
      contentLength: sql<number>`coalesce(length(${documents.content}), 0)`,
    })
    .from(documents)
    .where(like(documents.url, 'https://www.oversight.gov/%'));
  return new Map(rows.map((r) => [`${r.url}|${r.category}`, r.contentLength]));
}

function summarizeByYear(items: ContentItem[]): void {
  const byYear = new Map<string, number>();
  for (const item of items) {
    const year = (item.pubDate ?? '').slice(0, 4) || 'undated';
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }
  for (const [year, count] of [...byYear.entries()].sort()) {
    console.log(`    ${year}: ${count}`);
  }
}

function reportExtraction(signalId: string, items: ContentItem[]): void {
  const extracted = items.filter((i) => (i.content?.length ?? 0) >= CONTENT_FLOOR_CHARS);
  const subFloor = items.filter((i) => (i.content?.length ?? 0) < CONTENT_FLOOR_CHARS);
  const lengths = extracted.map((i) => i.content!.length).sort((a, b) => a - b);
  const median = lengths.length > 0 ? lengths[Math.floor(lengths.length / 2)] : 0;

  console.log(
    `  [${signalId}] Extraction: ${extracted.length}/${items.length} ≥${CONTENT_FLOOR_CHARS} chars (median ${median})`,
  );
  for (const i of subFloor) {
    console.log(
      `    sub-floor: ${(i.pubDate ?? '').slice(0, 10)} ${i.content?.length ?? 0} chars | ${(i.title ?? '').slice(0, 80)} | ${i.link}`,
    );
  }
}

/** Record per-week fetch_log rows for allowlisted categories only. */
async function logAllowlistedWeeks(
  signal: OversightSignal,
  items: ContentItem[],
  storedCount: number,
  from: string,
  to: string,
): Promise<void> {
  if (!FETCH_LOG_CATEGORIES.includes(signal.category)) return;
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
      category: signal.category,
      weekStart: week.start,
      weekEnd: week.end,
      itemsFetched: fetched,
      itemsStored: storedCount > 0 ? fetched : 0,
      errors: [],
    });
  }
}

async function runSignal(
  signal: OversightSignal,
  opts: OversightBackfillOptions,
  existing: Map<string, number>,
): Promise<{ matched: number; netNew: number }> {
  const { oigs } = parseOversightGovParams(signal.url);
  const chunks = quarterChunks(opts.from, opts.to);
  const items: ContentItem[] = [];

  const hasFullContent = (url: string) =>
    (existing.get(`${url}|${signal.category}`) ?? 0) >= CONTENT_FLOOR_CHARS;
  const skipDetailUrls = opts.skipExisting
    ? new Set([...existing.keys()].map((k) => k.split('|')[0]).filter(hasFullContent))
    : undefined;

  for (const [i, chunk] of chunks.entries()) {
    const chunkItems = await fetchOversightGovHistorical({
      oigs,
      dateFrom: chunk.from,
      dateTo: chunk.to,
      skipDetail: opts.dryRun,
      skipDetailUrls,
    });
    items.push(...chunkItems);
    console.log(
      `  [${signal.id}] chunk ${i + 1}/${chunks.length} (${chunk.from}..${chunk.to}): ${chunkItems.length} reports`,
    );
  }

  const netNewItems = items.filter((i) => !existing.has(`${i.link}|${signal.category}`));
  console.log(`  [${signal.id}] ${items.length} matched, ${netNewItems.length} net-new:`);
  summarizeByYear(items);

  if (opts.dryRun) return { matched: items.length, netNew: netNewItems.length };

  // --skip-existing: items we already hold with full content are excluded from
  // the content pass AND from storage — re-storing them would clobber their
  // richer metadata (content itself is protected by the #588 upsert guard).
  const toProcess = opts.skipExisting ? items.filter((i) => !hasFullContent(i.link ?? '')) : items;

  if (!opts.skipContent && toProcess.length > 0) {
    console.log(`  [${signal.id}] Extracting ${toProcess.length} PDFs...`);
    await fillOigContent(toProcess);
    reportExtraction(signal.id, toProcess);
  }

  const stored = await storeDocuments(toProcess, signal.category);
  console.log(`  [${signal.id}] Stored ${stored} → ${signal.category}`);

  await logAllowlistedWeeks(signal, toProcess, stored, opts.from, opts.to);
  return { matched: items.length, netNew: netNewItems.length };
}

async function runOversightGovBackfill(opts: OversightBackfillOptions): Promise<void> {
  const signals = oversightSignals().filter((s) => !opts.signal || s.id === opts.signal);
  if (signals.length === 0) {
    throw new Error(`No oversight.gov signal matches --signal ${opts.signal}`);
  }

  console.log(
    `[oversight-gov] Backfill ${opts.from} → ${opts.to}${opts.dryRun ? ' (dry-run)' : ''} — ${signals.length} signal(s)`,
  );

  const existing = await loadExistingDocs();
  console.log(`[oversight-gov] ${existing.size} existing oversight.gov document rows`);

  let matched = 0;
  let netNew = 0;
  for (const signal of signals) {
    console.log(`\n[oversight-gov] Signal ${signal.id} → ${signal.category}`);
    const result = await runSignal(signal, opts, existing);
    matched += result.matched;
    netNew += result.netNew;
  }

  console.log(`\n[oversight-gov] Three-numbers precheck (${opts.from} → ${opts.to}):`);
  console.log(`  1. Source-matched:          ${matched}`);
  console.log(`  2. Net-new after anti-join: ${netNew}`);
  console.log(
    `  3. Assessable estimate:     ~${Math.round(netNew * ASSESSABLE_RATE)} (${ASSESSABLE_RATE * 100}% extraction assumption)`,
  );
}

function parseCliArgs(args: string[]): OversightBackfillOptions {
  const opts: OversightBackfillOptions = {
    from: '',
    to: '',
    dryRun: false,
    skipContent: false,
    skipExisting: false,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--from') opts.from = args[++i];
    else if (args[i] === '--to') opts.to = args[++i];
    else if (args[i] === '--signal') opts.signal = args[++i];
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--skip-content') opts.skipContent = true;
    else if (args[i] === '--skip-existing') opts.skipExisting = true;
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
    `Usage: pnpm backfill:oversight-gov -- --from YYYY-MM-DD --to YYYY-MM-DD [options]

One-shot oversight.gov (CIGIE) bulk backfill: windowed facet queries per signal
(OPM/Treasury+TIGTA/State/ICIG/EAC+FEC), detail-page metadata + PDF extraction,
stores to each signal's category. fetch_log written only for categories where
oversight.gov is the sole OIG source (never executiveOversight).

Options:
  --from <date>     Start date (required)
  --to <date>       End date (required)
  --signal <id>     Run a single signal (e.g. oig_oversight_elections)
  --dry-run         Listing counts + three-numbers spend precheck; no writes
  --skip-content    Store listing/detail metadata without PDF extraction
  --skip-existing   Skip detail/PDF/store for docs already held with content`,
  );
  runOversightGovBackfill(parseCliArgs(argv))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[oversight-gov] Backfill failed:', err);
      process.exit(1);
    });
}
