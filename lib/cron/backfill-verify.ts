/**
 * CLI: pnpm backfill:verify [--category <key>] [--json]
 *
 * Checks that all pipeline stages completed correctly. Reports gaps and inconsistencies.
 */

import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable } from '@/lib/db';
import {
  getPaginationFitness,
  getFrPeriodCoverage,
  getGdeltCrossfeedCoverage,
} from '@/lib/services/backfill-source-coverage';
import {
  getContentCompleteness,
  getContentCompletenessByOrigin,
  getDocumentCoverage,
  getStageCompleteness,
  getBaselineCompleteness,
  getLayer2Completeness,
  getClOpinionCoverage,
  CONTENT_FIXABLE_TYPES,
  CONTENT_FIXABLE_ORIGINS,
} from '@/lib/services/backfill-verification-service';
import type {
  ContentCompleteness,
  DocumentCoverage,
  StageCompleteness,
  BaselineCompleteness,
  Layer2Completeness,
  Layer2PeriodStats,
  PaginationFitness,
  SourcePeriodCoverage,
  ClOpinionCoverage,
} from '@/lib/services/backfill-verification-service';
import type { Category } from '@/lib/types';

interface VerifyOptions {
  category?: string;
  json?: boolean;
}

interface VerifyReport {
  documentCoverage: DocumentCoverage[];
  contentCompleteness: ContentCompleteness[];
  contentCompletenessByOrigin: ContentCompleteness[];
  stageCompleteness: StageCompleteness;
  baselineCompleteness: BaselineCompleteness[];
  layer2Completeness: Layer2Completeness;
  paginationFitness: PaginationFitness[];
  frPeriodCoverage: SourcePeriodCoverage[];
  gdeltCrossfeedCoverage: SourcePeriodCoverage[];
  clOpinionCoverage: ClOpinionCoverage | null;
  warnings: string[];
}

const EXPECTED_PERIODS = ['biden_2022', 'biden_2021', 'trump_2017', 'trump_2018', 'trump_t2'];
const CL_PAGINATION_CAP = 900;

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

const THIN_CATEGORY_THRESHOLD = 500;

function checkGdeltCoverage(report: VerifyReport, cats: Category[]): string[] {
  const gdeltCats = new Set(report.gdeltCrossfeedCoverage.map((r) => r.category));
  const docsByCat = new Map<string, number>();
  for (const row of report.documentCoverage) {
    docsByCat.set(row.category, (docsByCat.get(row.category) ?? 0) + row.count);
  }
  const missingGdelt = cats
    .filter((c) => !gdeltCats.has(c.key) && (docsByCat.get(c.key) ?? 0) >= THIN_CATEGORY_THRESHOLD)
    .map((c) => c.key);
  if (missingGdelt.length > 0) {
    return [`Categories missing GDELT cross-feed: ${missingGdelt.join(', ')}`];
  }
  return [];
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

  for (const cc of report.contentCompleteness) {
    if (CONTENT_FIXABLE_TYPES.has(cc.sourceType)) {
      const source = cc.sourceType === 'Presidential Document' ? 'fr' : 'govinfo';
      warnings.push(
        `${cc.nullContent} ${cc.sourceType} docs have null content (run: pnpm backfill:content --source ${source})`,
      );
    }
  }

  for (const cc of report.contentCompletenessByOrigin) {
    const source = CONTENT_FIXABLE_ORIGINS.get(cc.sourceType);
    if (source) {
      warnings.push(
        `${cc.nullContent} ${cc.sourceType} docs have null content (run: pnpm backfill:content --source ${source})`,
      );
    }
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
  warnings.push(...checkGdeltCoverage(report, cats));

  for (const p of report.layer2Completeness) {
    if (p.missingPass1 > 0) {
      warnings.push(`${p.period}: ${p.missingPass1} docs missing L2 Pass 1`);
    }
    if (p.missingPass2 > 0) {
      warnings.push(`${p.period}: ${p.missingPass2} flagged docs missing L2 Pass 2`);
    }
    if (p.auditFalseNegatives > 0) {
      const rate = ((p.auditFalseNegatives / p.auditSampled) * 100).toFixed(1);
      warnings.push(
        `${p.period}: ${p.auditFalseNegatives}/${p.auditSampled} audit false negatives (${rate}%)`,
      );
    }
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

function printLayer2Completeness(periods: Layer2PeriodStats[]): void {
  console.log('\n=== Layer 2 Completeness ===');
  const hdr =
    `  ${'Period'.padEnd(22)}` +
    `${'Docs'.padStart(8)}` +
    `${'Pass 1'.padStart(10)}` +
    `${'P1 Miss'.padStart(10)}` +
    `${'P1 Flag'.padStart(10)}` +
    `${'Pass 2'.padStart(10)}` +
    `${'P2 Miss'.padStart(10)}` +
    `${'P2 Flag'.padStart(10)}` +
    `${'Audited'.padStart(10)}` +
    `${'False Neg'.padStart(12)}`;
  console.log(hdr);
  for (const p of periods) {
    const p1ok = p.missingPass1 === 0 ? '\u2713' : '\u26A0';
    const p2ok = p.missingPass2 === 0 ? '\u2713' : '\u26A0';
    const fnMark = p.auditFalseNegatives > 0 ? '\u26A0' : '';
    console.log(
      `  ${p.label.padEnd(22)}` +
        `${String(p.totalDocuments).padStart(8)}` +
        `${String(p.pass1Assessed).padStart(10)}` +
        `${String(p.missingPass1).padStart(8)} ${p1ok} ` +
        `${String(p.pass1Flagged).padStart(8)}` +
        `${String(p.pass2Assessed).padStart(10)}` +
        `${String(p.missingPass2).padStart(8)} ${p2ok} ` +
        `${String(p.pass2Flagged).padStart(10)}` +
        `${String(p.auditSampled).padStart(8)}` +
        `${String(p.auditFalseNegatives).padStart(10)}${fnMark ? ` ${fnMark}` : ''}`,
    );
  }
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
    const mark = fixable ? '\u26A0' : '\u2139';
    const source = cc.sourceType === 'Presidential Document' ? 'fr' : 'govinfo';
    const hint = fixable ? ` (run: pnpm backfill:content --source ${source})` : '';
    console.log(
      `  ${mark} ${cc.sourceType.padEnd(30)} ${String(cc.nullContent).padStart(7)} / ${String(cc.total).padStart(7)} null (${pct}%)${hint}`,
    );
  }
  for (const cc of contentByOrigin) {
    const pct = ((cc.nullContent / cc.total) * 100).toFixed(0);
    const source = CONTENT_FIXABLE_ORIGINS.get(cc.sourceType);
    const mark = source ? '\u26A0' : '\u2139';
    const hint = source ? ` (run: pnpm backfill:content --source ${source})` : '';
    console.log(
      `  ${mark} ${cc.sourceType.padEnd(30)} ${String(cc.nullContent).padStart(7)} / ${String(cc.total).padStart(7)} null (${pct}%)${hint}`,
    );
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

function printReport(report: VerifyReport, categoryFilter?: string): void {
  const cats = categoryFilter ? CATEGORIES.filter((c) => c.key === categoryFilter) : CATEGORIES;
  printDocumentCoverage(report.documentCoverage);
  printContentCompleteness(report.contentCompleteness, report.contentCompletenessByOrigin);

  console.log('\n=== Stage Completeness ===');
  const s = report.stageCompleteness;
  console.log(`  Documents missing scores:      ${s.missingScores} / ${s.totalDocuments}`);
  console.log(`  Documents missing embeddings:  ${s.missingEmbeddings} / ${s.totalDocuments}`);
  if (s.metadataOnlyCount > 0) {
    console.log(
      `  Metadata-only (excluded):      ${s.metadataOnlyCount} (not counted in missing embeddings)`,
    );
  }
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

  printLayer2Completeness(report.layer2Completeness);

  if (report.paginationFitness.length > 0) {
    console.log(`\n=== Pagination Fitness (CourtListener, cap=${CL_PAGINATION_CAP}) ===`);
    for (const pf of report.paginationFitness) {
      const mark = pf.peakWeeklyCount < CL_PAGINATION_CAP ? '\u2713' : '\u26A0';
      console.log(`  ${pf.category.padEnd(30)} peak=${pf.peakWeeklyCount} ${mark}`);
    }
  }

  printClOpinionCoverage(report.clOpinionCoverage);
  printFrPeriodCoverage(report.frPeriodCoverage, cats);
  printGdeltCoverage(report.gdeltCrossfeedCoverage, report.documentCoverage, cats);

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

  const [
    coverage,
    content,
    contentByOrigin,
    completeness,
    baselineStat,
    l2,
    pagination,
    frPeriod,
    gdeltCrossfeed,
    clOpinions,
  ] = await Promise.all([
    getDocumentCoverage(options.category),
    getContentCompleteness(options.category),
    getContentCompletenessByOrigin(options.category),
    getStageCompleteness(options.category),
    getBaselineCompleteness(),
    getLayer2Completeness(options.category),
    getPaginationFitness(options.category),
    getFrPeriodCoverage(options.category),
    getGdeltCrossfeedCoverage(options.category),
    getClOpinionCoverage(),
  ]);

  const report: VerifyReport = {
    documentCoverage: coverage,
    contentCompleteness: content,
    contentCompletenessByOrigin: contentByOrigin,
    stageCompleteness: completeness,
    baselineCompleteness: baselineStat,
    layer2Completeness: l2,
    paginationFitness: pagination,
    frPeriodCoverage: frPeriod,
    gdeltCrossfeedCoverage: gdeltCrossfeed,
    clOpinionCoverage: clOpinions,
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
