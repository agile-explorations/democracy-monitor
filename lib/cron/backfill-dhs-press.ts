/**
 * CLI: pnpm backfill:dhs-press -- --host dhs|ice|cbp|all (--period <id> | --from --to) [options]
 *
 * One-shot bulk backfill for DHS/ICE/CBP press releases (#605). Live newsroom
 * listings are purged to 2025-01-20, so the requested range is split at the
 * inauguration: the live portion walks the dated listings; the baseline portion
 * goes through recovery enumeration (DHS /archive/news facet; ICE/CBP sitemaps
 * with Wayback CDX first-capture date hints — the on-page date is authoritative
 * after fetch). Stores to immigrationEnforcement (all) + lawEnforcement (HSI
 * criminal subset), mirroring the backfill-dhs-oig dual-store pattern.
 *
 * Embeddings, scoring, and aggregation are deliberately left to the standard
 * runbook commands. Baseline-period runs require explicit owner approval.
 */

import { like } from 'drizzle-orm';
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import {
  bucketUrlsByPeriod,
  enumerateDhsArchivePress,
  fetchCdxFirstCaptures,
  fetchDhsArchivePage,
  fetchSitemapUrls,
  filterCbpPressUrls,
  filterIcePressUrls,
} from '@/lib/services/dhs-press-archive';
import {
  DHS_PRESS_POLITENESS_MS,
  dedupeCrossHostContentItems,
  enrichFromArticlePage,
  isHsiCriminalItem,
  toContentItem,
  walkListingRange,
} from '@/lib/services/dhs-press-fetcher';
import type { PressHost, PressListingItem } from '@/lib/services/dhs-press-parsers';
import { storeDocuments } from '@/lib/services/document-store';
import { recordFetchResult } from '@/lib/services/fetch-log-store';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';
import { getWeekRanges } from '@/lib/utils/date-utils';

const HOSTS: PressHost[] = ['dhs', 'ice', 'cbp'];
const CANARY_SAMPLE_SIZE = 50;
const CONTENT_FLOOR_CHARS = 100;
const BULK_WALK_MAX_PAGES = 600;

interface PressBackfillOptions {
  hosts: PressHost[];
  from: string;
  to: string;
  dryRun: boolean;
  skipExisting: boolean;
  noCdx: boolean;
  canary: boolean;
}

const CDX_PREFIXES: Record<PressHost, string> = {
  dhs: 'dhs.gov/news/',
  ice: 'ice.gov/news/releases/',
  cbp: 'cbp.gov/newsroom/',
};

const urlStub = (url: string, host: PressHost): PressListingItem => ({
  title: '',
  url,
  publishedAt: null,
  host,
});

/** Enumerate baseline-portion candidates for one host (no bodies yet). */
async function enumerateArchive(
  host: PressHost,
  from: string,
  to: string,
  noCdx: boolean,
): Promise<PressListingItem[]> {
  if (host === 'dhs') return enumerateDhsArchivePress(from, to);

  const sitemapUrls = await fetchSitemapUrls(`https://www.${host}.gov`);
  const pressUrls =
    host === 'ice' ? filterIcePressUrls(sitemapUrls) : filterCbpPressUrls(sitemapUrls, 'national');
  console.log(`  [${host}] sitemap: ${pressUrls.length} press URLs`);
  if (noCdx) return pressUrls.map((u) => urlStub(u, host));

  const captures = await fetchCdxFirstCaptures(CDX_PREFIXES[host]);
  const { candidates, unknown } = bucketUrlsByPeriod(pressUrls, captures, from, to);
  console.log(
    `  [${host}] CDX hint: ${candidates.length} candidates in range, ${unknown.length} without capture data (included; on-page date decides)`,
  );
  return [...candidates, ...unknown].map((u) => urlStub(u, host));
}

/** Enumerate one host across the inauguration split. */
async function enumerateHost(host: PressHost, opts: PressBackfillOptions) {
  const items: PressListingItem[] = [];
  if (opts.from < T2_INAUGURATION) {
    const archiveTo = opts.to < T2_INAUGURATION ? opts.to : T2_INAUGURATION;
    items.push(...(await enumerateArchive(host, opts.from, archiveTo, opts.noCdx)));
  }
  if (opts.to >= T2_INAUGURATION) {
    const liveFrom = opts.from >= T2_INAUGURATION ? opts.from : T2_INAUGURATION;
    // The fetcher's default walk cap (50 pages) suits weekly incremental runs;
    // a bulk span must walk the whole live listing (DHS ~119pp, CBP ~107pp —
    // live-caught 2026-08-07 when the T2 dry-run returned exactly 50×pageSize
    // for DHS). 600 comfortably exceeds any listing depth.
    const live = await walkListingRange(host, liveFrom, opts.to, BULK_WALK_MAX_PAGES);
    items.push(
      ...(host === 'cbp' ? live.filter((i) => i.urlClass !== 'local-media-release') : live),
    );
  }
  console.log(`  [${host}] ${items.length} enumerated`);
  return items;
}

async function loadExistingDocs(): Promise<Map<string, number>> {
  if (!isDbAvailable()) return new Map();
  const hostRows = await Promise.all(
    HOSTS.map((host) =>
      getDb()
        .select({ url: documents.url, category: documents.category, content: documents.content })
        .from(documents)
        .where(like(documents.url, `https://www.${host}.gov/%`)),
    ),
  );
  return new Map(hostRows.flat().map((r) => [`${r.url}|${r.category}`, r.content?.length ?? 0]));
}

function summarizeByYear(items: Array<{ publishedAt?: string | null; pubDate?: string }>): void {
  const byYear = new Map<string, number>();
  for (const item of items) {
    const year = (item.publishedAt ?? item.pubDate ?? '').slice(0, 4) || 'undated';
    byYear.set(year, (byYear.get(year) ?? 0) + 1);
  }
  for (const [year, count] of [...byYear.entries()].sort()) console.log(`  ${year}: ${count}`);
}

/**
 * Cheap canary enumeration: DHS samples spaced archive pages (dates span the
 * whole archive); ICE/CBP take sitemap URL stubs without CDX. The point is
 * era-stratified liveness + extraction health, not completeness.
 */
async function canaryEnumerate(host: PressHost): Promise<PressListingItem[]> {
  if (host === 'dhs') {
    const items: PressListingItem[] = [];
    for (const page of [0, 80, 160, 240, 320, 400]) {
      await sleep(DHS_PRESS_POLITENESS_MS);
      items.push(...(await fetchDhsArchivePage(page)));
    }
    return items;
  }
  const sitemapUrls = await fetchSitemapUrls(`https://www.${host}.gov`);
  const pressUrls =
    host === 'ice' ? filterIcePressUrls(sitemapUrls) : filterCbpPressUrls(sitemapUrls, 'national');
  return pressUrls.map((u) => urlStub(u, host));
}

/** Stratified canary: sample enumerated URLs, fetch articles, report extraction health. */
async function runCanary(items: PressListingItem[], host: PressHost): Promise<void> {
  const step = Math.max(1, Math.floor(items.length / CANARY_SAMPLE_SIZE));
  const sample = items.filter((_i, idx) => idx % step === 0).slice(0, CANARY_SAMPLE_SIZE);
  let ok = 0;
  let dated = 0;
  let withBody = 0;
  for (const item of sample) {
    await sleep(DHS_PRESS_POLITENESS_MS);
    await enrichFromArticlePage(item);
    if (item.title) ok++;
    if (item.publishedAt) dated++;
    if ((item.body?.length ?? 0) >= CONTENT_FLOOR_CHARS) withBody++;
  }
  console.log(
    `  [${host}] canary: ${sample.length} sampled → ${ok} fetched+parsed, ${dated} dated, ${withBody} with ≥${CONTENT_FLOOR_CHARS}-char body`,
  );
  const failed = sample.filter((i) => !i.title || !i.publishedAt);
  for (const f of failed.slice(0, 10)) console.log(`    FAIL ${f.url}`);
}

/** Detail-fetch enumerated items (skipping already-held URLs) with progress/ETA logging. */
async function runDetailPass(
  items: PressListingItem[],
  hasFullContent: (url: string) => boolean,
  skipExisting: boolean,
): Promise<PressListingItem[]> {
  const toFetch = skipExisting ? items.filter((i) => !hasFullContent(i.url)) : items;
  const skipped = items.length - toFetch.length;
  if (skipped > 0) console.log(`  detail pass: skipping ${skipped} already-held URLs`);
  console.log(
    `  detail pass: ${toFetch.length} articles (~${Math.round((toFetch.length * 2.5) / 60)} min at 2s politeness)`,
  );
  for (const [idx, item] of toFetch.entries()) {
    await sleep(DHS_PRESS_POLITENESS_MS);
    await enrichFromArticlePage(item);
    if ((idx + 1) % 100 === 0) console.log(`    ${idx + 1}/${toFetch.length} fetched`);
  }
  return toFetch;
}

/** Write per-week fetch_log rows for a category (dhs_press rows are fresh — no
 * ledger-overwrite hazard, but see backfill-dhs-oig logImmigrationWeeks for why
 * shared-origin categories must never be blanket-logged). */
async function logWeeks(
  items: ContentItem[],
  category: string,
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
      sourceOrigin: 'dhs_press',
      category,
      weekStart: week.start,
      weekEnd: week.end,
      itemsFetched: fetched,
      itemsStored: storedCount > 0 ? fetched : 0,
      errors: [],
    });
  }
}

async function runPressBackfill(opts: PressBackfillOptions): Promise<void> {
  console.log(
    `[dhs-press] Backfill hosts=${opts.hosts.join(',')} ${opts.from} → ${opts.to}${opts.dryRun ? ' (dry-run)' : ''}${opts.canary ? ' (canary)' : ''}`,
  );
  if (opts.hosts.length < HOSTS.length && !opts.canary) {
    console.warn(
      '[dhs-press] WARNING: single-host run — cross-host mirror dedup only sees the fetched hosts',
    );
  }

  if (opts.canary) {
    // One host failing (WAF, outage) is itself a canary result — keep probing the rest.
    for (const host of opts.hosts) {
      try {
        await runCanary(await canaryEnumerate(host), host);
      } catch (err) {
        console.error(`  [${host}] canary FAILED: ${err}`);
      }
    }
    return;
  }

  const enumerated: PressListingItem[] = [];
  for (const host of opts.hosts) {
    enumerated.push(...(await enumerateHost(host, opts)));
  }

  if (opts.dryRun) {
    console.log(`\n[dhs-press] Dry run — ${enumerated.length} enumerated, by year (dated items):`);
    summarizeByYear(enumerated);
    console.log(
      `  undated (sitemap/CDX candidates): ${enumerated.filter((i) => !i.publishedAt).length}`,
    );
    return;
  }

  const existing = await loadExistingDocs();
  const hasFullContent = (url: string) =>
    (existing.get(`${url}|immigrationEnforcement`) ?? 0) >= CONTENT_FLOOR_CHARS;
  const fetched = await runDetailPass(enumerated, hasFullContent, opts.skipExisting);

  const inRange = fetched.filter(
    (i) => i.title && i.publishedAt && i.publishedAt >= opts.from && i.publishedAt <= opts.to,
  );
  const dropped = fetched.length - inRange.length;
  console.log(
    `\n[dhs-press] ${inRange.length} releases in range (${dropped} dropped: fetch-failed or out-of-range)`,
  );
  summarizeByYear(inRange);

  const contentItems = dedupeCrossHostContentItems(inRange.map(toContentItem));
  const hsiItems = contentItems.filter((c) => {
    const meta = c.metadata as { topicTag?: string | null } | undefined;
    return isHsiCriminalItem({
      title: c.title ?? '',
      topicTag: meta?.topicTag ?? undefined,
      teaser: c.content?.slice(0, 600),
    });
  });

  const storedImm = await storeDocuments(contentItems, 'immigrationEnforcement');
  const storedLaw = await storeDocuments(hsiItems, 'lawEnforcement');
  console.log(
    `[dhs-press] Stored: ${storedImm} immigrationEnforcement, ${storedLaw} lawEnforcement (HSI subset of ${hsiItems.length})`,
  );

  await logWeeks(contentItems, 'immigrationEnforcement', storedImm, opts.from, opts.to);
  await logWeeks(hsiItems, 'lawEnforcement', storedLaw, opts.from, opts.to);
  console.log('[dhs-press] fetch_log updated');
}

function parseCliArgs(args: string[]): PressBackfillOptions {
  const opts: PressBackfillOptions = {
    hosts: HOSTS,
    from: '',
    to: '',
    dryRun: false,
    skipExisting: false,
    noCdx: false,
    canary: false,
  };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--host') {
      const value = args[++i];
      if (value !== 'all') {
        if (!HOSTS.includes(value as PressHost)) throw new Error(`Unknown --host: ${value}`);
        opts.hosts = [value as PressHost];
      }
    } else if (args[i] === '--period') {
      const period = BASELINE_CONFIGS.find((b) => b.id === args[++i]);
      if (!period) {
        throw new Error(`Unknown --period; valid: ${BASELINE_CONFIGS.map((b) => b.id).join(', ')}`);
      }
      opts.from = period.from;
      opts.to = period.to;
    } else if (args[i] === '--from') opts.from = args[++i];
    else if (args[i] === '--to') opts.to = args[++i];
    else if (args[i] === '--dry-run') opts.dryRun = true;
    else if (args[i] === '--skip-existing') opts.skipExisting = true;
    else if (args[i] === '--no-cdx') opts.noCdx = true;
    else if (args[i] === '--canary') opts.canary = true;
  }
  if (opts.canary && !opts.from) {
    // Canary defaults to the full recoverable span: probes liveness per era.
    opts.from = '2017-01-20';
    opts.to = opts.to || new Date().toISOString().slice(0, 10);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(opts.from) || !/^\d{4}-\d{2}-\d{2}$/.test(opts.to)) {
    throw new Error('--from/--to (YYYY-MM-DD) or --period required');
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm backfill:dhs-press -- --host dhs|ice|cbp|all (--period <id> | --from --to) [options]

One-shot DHS/ICE/CBP press-release backfill: live listings for >= 2025-01-20,
archive recovery (DHS /archive/news; ICE/CBP sitemap + Wayback CDX date hints)
for earlier ranges. Stores to immigrationEnforcement (all) + lawEnforcement
(HSI criminal subset). Baseline-period runs require explicit owner approval.

Options:
  --host <h>        dhs | ice | cbp | all (default all; cross-host dedup needs all)
  --period <id>     A baseline period id (e.g. biden_2022) as the date range
  --from/--to       Explicit date range (YYYY-MM-DD)
  --dry-run         Enumerate and report counts; no article fetches, no writes
  --skip-existing   Skip article fetch + store for URLs already held with content
  --no-cdx          Skip Wayback date hints; fetch every sitemap URL (slow)
  --canary          Sample ~${CANARY_SAMPLE_SIZE} URLs/host: liveness + extraction report, no writes`,
  );
  runPressBackfill(parseCliArgs(argv))
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[dhs-press] Backfill failed:', err);
      process.exit(1);
    });
}
