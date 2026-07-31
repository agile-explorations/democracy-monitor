/**
 * Validate corrected FR signal queries against the Federal Register API.
 *
 * Tests each FR signal URL for a target week, shows document titles and agencies
 * for spot-checking. Flags signals returning 0 docs (over-restriction) or >200
 * docs (under-restriction). For unscoped cross-agency signals, shows unique
 * agency counts and top agencies by document count.
 *
 * Usage:
 *   pnpm validate:fr-signals                          # All categories, latest week
 *   pnpm validate:fr-signals --category civilService   # Single category
 *   pnpm validate:fr-signals --week 2025-03-10         # Specific week
 */

import { CATEGORIES } from '@/lib/data/categories';
import { parseSignalParams, buildFrApiUrl } from '@/lib/services/federal-register-fetcher';
import { formatError } from '@/lib/utils/api-helpers';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';

const TOP_DOCS = 5;
const HIGH_DOC_THRESHOLD = 200;
const FETCH_DELAY_MS = 300;

/** Signals that are intentionally unscoped (cross-agency topics). */
const UNSCOPED_CROSS_AGENCY = new Set([
  'fr_inspector_general',
  'fr_oversight',
  'fr_ig_personnel',
  'fr_foia',
  'fr_open_data',
  'fr_foia_regulations',
  'fr_foia_fees',
  'fr_press_credentials',
  'fr_press_freedom',
  'fr_shield_law',
  'fr_prepublication_review',
]);

interface FrApiDocument {
  title?: string;
  html_url?: string;
  agencies?: { name: string; slug: string }[];
  type?: string;
}

function getDefaultWeekStart(): string {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const daysBack = dayOfWeek === 0 ? 7 : dayOfWeek;
  const monday = new Date(now);
  monday.setDate(now.getDate() - daysBack);
  return monday.toISOString().slice(0, 10);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function validateSignal(
  signalId: string,
  signalUrl: string,
  dateFrom: string,
  dateTo: string,
): Promise<{
  count: number;
  totalCount: number;
  docs: FrApiDocument[];
}> {
  const params = parseSignalParams(signalUrl);
  const url = buildFrApiUrl(params, 1, dateFrom, dateTo, 20);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': `DemocracyMonitor/1.0 (validate-fr-signals/${signalId})`,
    },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();
  return {
    count: data.results?.length ?? 0,
    totalCount: data.total_count ?? data.count ?? 0,
    docs: data.results ?? [],
  };
}

function printAgencyBreakdown(docs: FrApiDocument[]): void {
  const agencyCounts = new Map<string, number>();
  for (const doc of docs) {
    for (const agency of doc.agencies ?? []) {
      const name = agency.name || agency.slug || '(unknown)';
      agencyCounts.set(name, (agencyCounts.get(name) ?? 0) + 1);
    }
  }

  const sorted = [...agencyCounts.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`      Unique agencies: ${sorted.length}`);
  console.log('      Top agencies:');
  for (const [name, count] of sorted.slice(0, 10)) {
    console.log(`        ${count.toString().padStart(4)} — ${name}`);
  }
}

async function run(categoryFilter?: string, weekStart?: string): Promise<void> {
  const dateFrom = weekStart ?? getDefaultWeekStart();
  const dateTo = addDays(dateFrom, 6);

  console.log(`[validate-fr-signals] Validating FR signals for week ${dateFrom} to ${dateTo}\n`);

  const categories = categoryFilter
    ? CATEGORIES.filter((c) => c.key === categoryFilter)
    : CATEGORIES;

  if (categories.length === 0) {
    console.error(`[validate-fr-signals] Unknown category: ${categoryFilter}`);
    process.exit(1);
  }

  const warnings: string[] = [];

  for (const cat of categories) {
    const frSignals = cat.signals.filter((s) => s.type === 'federal_register');
    if (frSignals.length === 0) continue;

    console.log(`\n=== ${cat.key} (${cat.title}) ===\n`);

    for (const signal of frSignals) {
      try {
        const result = await validateSignal(signal.id, signal.url, dateFrom, dateTo);
        const flag =
          result.totalCount === 0
            ? ' *** ZERO DOCS — possible over-restriction'
            : result.totalCount > HIGH_DOC_THRESHOLD
              ? ` *** ${result.totalCount} DOCS — possible under-restriction`
              : '';

        console.log(
          `  ${signal.id}: ${result.totalCount} total docs (showing ${result.count})${flag}`,
        );

        if (flag) warnings.push(`${cat.key}/${signal.id}: ${flag.trim()}`);

        for (const doc of result.docs.slice(0, TOP_DOCS)) {
          const agencies = doc.agencies?.map((a) => a.name).join(', ') || '(no agency)';
          const title = doc.title || '(untitled)';
          console.log(`    - [${agencies}] ${title}`);
        }

        if (UNSCOPED_CROSS_AGENCY.has(signal.id) && result.docs.length > 0) {
          printAgencyBreakdown(result.docs);
        }

        await sleep(FETCH_DELAY_MS);
      } catch (err) {
        const msg = formatError(err);
        console.log(`  ${signal.id}: ERROR — ${msg}`);
        warnings.push(`${cat.key}/${signal.id}: ERROR — ${msg}`);
      }
    }
  }

  if (warnings.length > 0) {
    console.log('\n\n=== WARNINGS ===\n');
    for (const w of warnings) console.log(`  ${w}`);
  }

  console.log('\n[validate-fr-signals] Done.');
}

if (require.main === module) {
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm validate:fr-signals [options]

Options:
  --category <key>    Validate a single category (default: all)
  --week <YYYY-MM-DD> Week start date (default: most recent Monday)`,
  );

  const catIdx = args.indexOf('--category');
  const weekIdx = args.indexOf('--week');
  const categoryFilter = catIdx >= 0 ? args[catIdx + 1] : undefined;
  const weekStart = weekIdx >= 0 ? args[weekIdx + 1] : undefined;

  run(categoryFilter, weekStart)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[validate-fr-signals] Fatal error:', err);
      process.exit(1);
    });
}
