/**
 * CLI: pnpm backfill:verify [--category <key>] [--json]
 *
 * Checks that all pipeline stages completed correctly. Reports gaps and inconsistencies.
 */

import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable } from '@/lib/db';
import {
  getDocumentCoverage,
  getStageCompleteness,
  getBaselineCompleteness,
  getLayer2Completeness,
  getPaginationFitness,
  getFrPeriodCoverage,
  getGdeltCrossfeedCoverage,
} from '@/lib/services/backfill-verification-service';
import type {
  DocumentCoverage,
  StageCompleteness,
  BaselineCompleteness,
  Layer2Completeness,
  PaginationFitness,
  SourcePeriodCoverage,
} from '@/lib/services/backfill-verification-service';
import type { Category } from '@/lib/types';

interface VerifyOptions {
  category?: string;
  json?: boolean;
}

interface VerifyReport {
  documentCoverage: DocumentCoverage[];
  stageCompleteness: StageCompleteness;
  baselineCompleteness: BaselineCompleteness[];
  layer2Completeness: Layer2Completeness;
  paginationFitness: PaginationFitness[];
  frPeriodCoverage: SourcePeriodCoverage[];
  gdeltCrossfeedCoverage: SourcePeriodCoverage[];
  warnings: string[];
}

const EXPECTED_PERIODS = ['biden_2022', 'biden_2021', 'trump_2017', 'trump_2018', 'trump_t2'];
const CL_PAGINATION_CAP = 300;

function checkFrCoverage(frCoverage: SourcePeriodCoverage[], cats: Category[]): string[] {
  const warnings: string[] = [];
  const frByCat = new Map<string, Set<string>>();
  for (const row of frCoverage) {
    if (!frByCat.has(row.category)) frByCat.set(row.category, new Set());
    frByCat.get(row.category)!.add(row.period);
  }
  for (const cat of cats) {
    const periods = frByCat.get(cat.key);
    if (!periods) {
      warnings.push(`${cat.key} has no FR documents in any period`);
      continue;
    }
    const missing = EXPECTED_PERIODS.filter((p) => !periods.has(p));
    if (missing.length > 0) {
      warnings.push(`${cat.key} missing FR documents in: ${missing.join(', ')}`);
    }
  }
  return warnings;
}

function collectWarnings(report: VerifyReport, categoryFilter?: string): string[] {
  const warnings: string[] = [];
  const { stageCompleteness: s } = report;
  const cats = categoryFilter ? CATEGORIES.filter((c) => c.key === categoryFilter) : CATEGORIES;

  if (s.missingScores > 0) {
    warnings.push(`${s.missingScores} documents need scores (run: pnpm recompute-scores)`);
  }
  if (s.missingEmbeddings > 0) {
    warnings.push(`${s.missingEmbeddings} documents need embedding (run: pnpm backfill)`);
  }
  if (s.missingAggregates > 0) {
    warnings.push(`${s.missingAggregates} weeks need aggregates (run: pnpm backfill)`);
  }

  const expectedBaselines = BASELINE_CONFIGS.length;
  for (const cat of cats) {
    const catBaselines = report.baselineCompleteness.filter((b) => b.category === cat.key);
    if (catBaselines.length < expectedBaselines) {
      const missing = expectedBaselines - catBaselines.length;
      warnings.push(`${cat.key} missing ${missing} baseline(s) (run: pnpm compute-baseline-stats)`);
    }
  }

  for (const pf of report.paginationFitness) {
    if (pf.peakWeeklyCount >= CL_PAGINATION_CAP) {
      warnings.push(
        `${pf.category} CourtListener peak=${pf.peakWeeklyCount} hits pagination cap ${CL_PAGINATION_CAP}`,
      );
    }
  }

  warnings.push(...checkFrCoverage(report.frPeriodCoverage, cats));

  const gdeltCats = new Set(report.gdeltCrossfeedCoverage.map((r) => r.category));
  const missingGdelt = cats.filter((c) => !gdeltCats.has(c.key)).map((c) => c.key);
  if (missingGdelt.length > 0) {
    warnings.push(`Categories missing GDELT cross-feed: ${missingGdelt.join(', ')}`);
  }

  const { layer2Completeness: l2 } = report;
  if (l2.missingPass1 > 0) {
    warnings.push(`${l2.missingPass1} T2 docs missing L2 Pass 1 (run: pnpm layer2:backfill)`);
  }
  if (l2.missingPass2 > 0) {
    warnings.push(
      `${l2.missingPass2} Pass 1 flagged docs missing L2 Pass 2 (run: pnpm layer2:backfill)`,
    );
  }

  return warnings;
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

function printGdeltCoverage(gdeltCoverage: SourcePeriodCoverage[], cats: Category[]): void {
  console.log('\n=== GDELT Cross-Feed Coverage ===');
  const gdeltMap = new Map(gdeltCoverage.map((r) => [r.category, r.count]));
  for (const cat of cats) {
    const count = gdeltMap.get(cat.key) ?? 0;
    const mark = count > 0 ? '\u2713' : '\u2717';
    console.log(`  ${cat.key.padEnd(30)} ${mark} ${count}`);
  }
}

function printDocumentCoverage(coverage: DocumentCoverage[]): void {
  console.log('\n=== Document Coverage ===');
  const grouped = new Map<string, Map<string, number>>();
  for (const row of coverage) {
    if (!grouped.has(row.category)) grouped.set(row.category, new Map());
    grouped.get(row.category)!.set(row.sourceOrigin, row.count);
  }
  for (const [cat, sources] of [...grouped.entries()].sort()) {
    for (const [source, count] of [...sources.entries()].sort()) {
      const mark = count > 0 ? '\u2713' : '\u2717';
      console.log(`  ${cat.padEnd(30)} ${source.padEnd(20)} ${mark} ${count}`);
    }
  }
}

function printReport(report: VerifyReport, categoryFilter?: string): void {
  const cats = categoryFilter ? CATEGORIES.filter((c) => c.key === categoryFilter) : CATEGORIES;
  printDocumentCoverage(report.documentCoverage);

  console.log('\n=== Stage Completeness ===');
  const s = report.stageCompleteness;
  console.log(`  Documents missing scores:      ${s.missingScores} / ${s.totalDocuments}`);
  console.log(`  Documents missing embeddings:  ${s.missingEmbeddings} / ${s.totalDocuments}`);
  console.log(`  Weeks missing aggregates:      ${s.missingAggregates} / ${s.totalWeeks}`);

  console.log('\n=== Baseline Completeness ===');
  const categoryKeys = new Set(CATEGORIES.map((c) => c.key));
  const baselinesByConfig = new Map<string, string[]>();
  for (const b of report.baselineCompleteness) {
    if (!categoryKeys.has(b.category)) continue; // skip non-monitoring categories (e.g. intent)
    if (!baselinesByConfig.has(b.baselineId)) baselinesByConfig.set(b.baselineId, []);
    baselinesByConfig.get(b.baselineId)!.push(b.category);
  }
  for (const config of BASELINE_CONFIGS) {
    const bCats = baselinesByConfig.get(config.id) || [];
    console.log(`  ${config.id}: ${bCats.length} / ${CATEGORIES.length} categories`);
  }

  console.log('\n=== Layer 2 Completeness ===');
  const l2 = report.layer2Completeness;
  console.log(`  T2 documents:   ${l2.totalT2Documents}`);
  console.log(`  Missing Pass 1: ${l2.missingPass1}`);
  console.log(`  Pass 1 flagged: ${l2.pass1Flagged}`);
  console.log(`  Pass 2 assessed: ${l2.pass2Assessed} / ${l2.pass1Flagged} flagged`);
  console.log(`  Missing Pass 2: ${l2.missingPass2}`);

  if (report.paginationFitness.length > 0) {
    console.log(`\n=== Pagination Fitness (CourtListener, cap=${CL_PAGINATION_CAP}) ===`);
    for (const pf of report.paginationFitness) {
      const mark = pf.peakWeeklyCount < CL_PAGINATION_CAP ? '\u2713' : '\u26A0';
      console.log(`  ${pf.category.padEnd(30)} peak=${pf.peakWeeklyCount} ${mark}`);
    }
  }

  printFrPeriodCoverage(report.frPeriodCoverage, cats);
  printGdeltCoverage(report.gdeltCrossfeedCoverage, cats);

  if (report.warnings.length > 0) {
    console.log('\n=== Warnings ===');
    for (const w of report.warnings) {
      console.log(`  \u26A0 ${w}`);
    }
  } else {
    console.log('\n=== All checks passed ===');
  }
}

export async function runVerify(options: VerifyOptions): Promise<VerifyReport> {
  if (!isDbAvailable()) {
    throw new Error('DATABASE_URL not configured');
  }

  console.log('[verify] Running completeness checks...');
  if (options.category) console.log(`[verify] Category filter: ${options.category}`);

  const [coverage, completeness, baselineStat, l2, pagination, frPeriod, gdeltCrossfeed] =
    await Promise.all([
      getDocumentCoverage(options.category),
      getStageCompleteness(options.category),
      getBaselineCompleteness(),
      getLayer2Completeness(options.category),
      getPaginationFitness(options.category),
      getFrPeriodCoverage(options.category),
      getGdeltCrossfeedCoverage(options.category),
    ]);

  const report: VerifyReport = {
    documentCoverage: coverage,
    stageCompleteness: completeness,
    baselineCompleteness: baselineStat,
    layer2Completeness: l2,
    paginationFitness: pagination,
    frPeriodCoverage: frPeriod,
    gdeltCrossfeedCoverage: gdeltCrossfeed,
    warnings: [],
  };
  report.warnings = collectWarnings(report, options.category);

  return report;
}

function parseCliArgs(args: string[]): VerifyOptions {
  const opts: VerifyOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--category') opts.category = args[++i];
    else if (arg === '--json') opts.json = true;
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const options = parseCliArgs(process.argv.slice(2));
  runVerify(options)
    .then((report) => {
      if (options.json) {
        console.log(JSON.stringify(report, null, 2));
      } else {
        printReport(report, options.category);
      }
      process.exit(report.warnings.length > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('[verify] Fatal error:', err);
      process.exit(1);
    });
}
