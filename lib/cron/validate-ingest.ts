/**
 * CLI: pnpm validate:ingest [--category <key>]
 *
 * Checks source coverage, content completeness, pagination fitness,
 * FR/GDELT period coverage, and CourtListener opinion coverage.
 */

import { CATEGORIES } from '@/lib/data/categories';
import type {
  ContentCompleteness,
  DocumentCoverage,
  IngestReport,
  SourcePeriodCoverage,
  ClOpinionCoverage,
} from '@/lib/services/ingest-validation-service';
import {
  runIngestValidation,
  CONTENT_FIXABLE_TYPES,
  CONTENT_FIXABLE_ORIGINS,
} from '@/lib/services/ingest-validation-service';
import type { Category } from '@/lib/types';
import { checkHelp } from '@/lib/utils/cli-help';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WARN = '\u26A0';
const CL_PAGINATION_CAP = 900;
const EXPECTED_PERIODS = ['biden_2022', 'biden_2021', 'trump_2017', 'trump_2018', 'trump_t2'];

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function printDocumentCoverage(coverage: DocumentCoverage[]): void {
  console.log('\n=== Document Coverage ===');
  const grouped = new Map<string, Map<string, number>>();
  for (const row of coverage) {
    if (!grouped.has(row.category)) grouped.set(row.category, new Map());
    grouped.get(row.category)!.set(row.sourceOrigin, row.count);
  }
  const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
  let grandTotal = 0;
  for (const [cat, sources] of [...grouped.entries()].sort()) {
    let catTotal = 0;
    for (const [source, count] of [...sources.entries()].sort()) {
      const mark = count > 0 ? '\u2713' : '\u2717';
      console.log(`  ${cat.padEnd(30)} ${source.padEnd(20)} ${mark} ${String(count).padStart(8)}`);
      catTotal += count;
    }
    console.log(`  ${''.padEnd(53)} ${bold(String(catTotal).padStart(8))}\n`);
    grandTotal += catTotal;
  }
  console.log(`  ${''.padEnd(47)} ${bold(`TOTAL ${String(grandTotal).padStart(8)}`)}`);
}

function printContentCompleteness(
  content: ContentCompleteness[],
  contentByOrigin: ContentCompleteness[],
): void {
  if (content.length === 0 && contentByOrigin.length === 0) return;
  console.log('\n=== Content Completeness ===');
  for (const cc of content) {
    const pct = ((cc.nullContent / cc.total) * 100).toFixed(0);
    const fixable = CONTENT_FIXABLE_TYPES.has(cc.sourceType);
    const mark = fixable ? WARN : '\u2139';
    const source = cc.sourceType === 'Presidential Document' ? 'fr' : 'govinfo';
    const hint = fixable ? ` (run: pnpm backfill:content --source ${source})` : '';
    console.log(
      `  ${mark} ${cc.sourceType.padEnd(30)} ${String(cc.nullContent).padStart(7)} / ${String(cc.total).padStart(7)} null (${pct}%)${hint}`,
    );
  }
  for (const cc of contentByOrigin) {
    const pct = ((cc.nullContent / cc.total) * 100).toFixed(0);
    const source = CONTENT_FIXABLE_ORIGINS.get(cc.sourceType);
    const mark = source ? WARN : '\u2139';
    const hint = source ? ` (run: pnpm backfill:content --source ${source})` : '';
    console.log(
      `  ${mark} ${cc.sourceType.padEnd(30)} ${String(cc.nullContent).padStart(7)} / ${String(cc.total).padStart(7)} null (${pct}%)${hint}`,
    );
  }
}

function printPaginationFitness(report: IngestReport): void {
  if (report.paginationFitness.length === 0) return;
  console.log(`\n=== Pagination Fitness (CourtListener, cap=${CL_PAGINATION_CAP}) ===`);
  for (const pf of report.paginationFitness) {
    const mark = pf.peakWeeklyCount < CL_PAGINATION_CAP ? '\u2713' : WARN;
    console.log(`  ${pf.category.padEnd(30)} peak=${pf.peakWeeklyCount} ${mark}`);
  }
}

function printFrPeriodCoverage(frCoverage: SourcePeriodCoverage[], cats: Category[]): void {
  console.log('\n=== FR Period Coverage ===');
  const frByCat = new Map<string, Map<string, number>>();
  for (const row of frCoverage) {
    if (!frByCat.has(row.category)) frByCat.set(row.category, new Map());
    frByCat.get(row.category)!.set(row.period, row.count);
  }
  const hdr = EXPECTED_PERIODS.map((p) => p.replace(/^[a-z]+_/, '').padStart(6)).join(' ');
  console.log(`  ${''.padEnd(30)} ${hdr}`);
  for (const cat of cats) {
    const pMap = frByCat.get(cat.key);
    const vals = EXPECTED_PERIODS.map((p) => {
      const c = pMap?.get(p) ?? 0;
      return (c > 0 ? String(c) : '-').padStart(6);
    });
    console.log(`  ${cat.key.padEnd(30)} ${vals.join(' ')}`);
  }
}

function printGdeltCoverage(
  gdeltCoverage: SourcePeriodCoverage[],
  docCoverage: DocumentCoverage[],
  cats: Category[],
): void {
  console.log('\n=== GDELT Cross-Feed Coverage ===');
  const gdeltMap = new Map(gdeltCoverage.map((r) => [r.category, r.count]));
  const docsByCat = new Map<string, number>();
  for (const row of docCoverage) {
    docsByCat.set(row.category, (docsByCat.get(row.category) ?? 0) + row.count);
  }
  for (const cat of cats) {
    const count = gdeltMap.get(cat.key) ?? 0;
    const thin = (docsByCat.get(cat.key) ?? 0) < 500;
    const mark = count > 0 ? '\u2713' : thin ? '-' : '\u2717';
    const note = count === 0 && thin ? ' (thin category)' : '';
    console.log(`  ${cat.key.padEnd(30)} ${mark} ${count}${note}`);
  }
}

function printClOpinionCoverage(cl: ClOpinionCoverage | null): void {
  if (!cl) return;
  console.log('\n=== CourtListener Opinion Coverage ===');
  console.log(`  Docket entries:            ${String(cl.docketEntries).padStart(8)}`);
  console.log(`  Opinion documents:         ${String(cl.opinionDocuments).padStart(8)}`);
  console.log(`  Unique cases (by case_id): ${String(cl.uniqueCases).padStart(8)}`);
  const withPct =
    cl.uniqueCases > 0 ? ((cl.casesWithOpinion / cl.uniqueCases) * 100).toFixed(1) : '0';
  const withoutPct =
    cl.uniqueCases > 0 ? ((cl.casesWithoutOpinion / cl.uniqueCases) * 100).toFixed(1) : '0';
  console.log(
    `  Cases with opinion:        ${String(cl.casesWithOpinion).padStart(8)} (${withPct}%)`,
  );
  console.log(
    `  Cases without opinion:     ${String(cl.casesWithoutOpinion).padStart(8)} (${withoutPct}%)`,
  );
}

function printReport(report: IngestReport, categoryFilter?: string): void {
  const cats = categoryFilter ? CATEGORIES.filter((c) => c.key === categoryFilter) : CATEGORIES;
  printDocumentCoverage(report.documentCoverage);
  printContentCompleteness(report.contentCompleteness, report.contentCompletenessByOrigin);
  printPaginationFitness(report);
  printClOpinionCoverage(report.clOpinionCoverage);
  printFrPeriodCoverage(report.frPeriodCoverage, cats);
  printGdeltCoverage(report.gdeltCrossfeedCoverage, report.documentCoverage, cats);

  if (report.warnings.length > 0) {
    console.log('\n=== Warnings ===');
    for (const w of report.warnings) {
      console.log(`  ${WARN} ${w}`);
    }
  } else {
    console.log('\n=== All checks passed ===');
  }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseCliArgs(args: string[]): { category?: string } {
  const opts: { category?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category') opts.category = args[++i];
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm validate:ingest [options]

Options:
  --category <key>    Filter to a single category`,
  );
  const options = parseCliArgs(argv);

  console.log('[validate:ingest] Running ingest validation...');
  if (options.category) console.log(`[validate:ingest] Category filter: ${options.category}`);

  runIngestValidation(options.category)
    .then((report) => {
      printReport(report, options.category);
      process.exit(report.warnings.length > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('[validate:ingest] Fatal error:', err);
      process.exit(1);
    });
}
