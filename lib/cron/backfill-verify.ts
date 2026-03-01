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
} from '@/lib/services/backfill-verification-service';
import type {
  DocumentCoverage,
  StageCompleteness,
  BaselineCompleteness,
  Layer2Completeness,
  PaginationFitness,
} from '@/lib/services/backfill-verification-service';

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
  warnings: string[];
}

function collectWarnings(report: VerifyReport): string[] {
  const warnings: string[] = [];
  const { stageCompleteness: s } = report;

  if (s.missingScores > 0) {
    warnings.push(`${s.missingScores} documents need scores (run: pnpm recompute-scores)`);
  }
  if (s.missingEmbeddings > 0) {
    warnings.push(`${s.missingEmbeddings} documents need embedding (run: pnpm backfill)`);
  }
  if (s.missingAggregates > 0) {
    warnings.push(`${s.missingAggregates} weeks need aggregates (run: pnpm backfill)`);
  }

  // Check for categories missing baselines
  const baselineCats = new Set(report.baselineCompleteness.map((b) => b.category));
  const expectedBaselines = BASELINE_CONFIGS.length;
  for (const cat of CATEGORIES) {
    const catBaselines = report.baselineCompleteness.filter((b) => b.category === cat.key);
    if (catBaselines.length < expectedBaselines) {
      const missing = expectedBaselines - catBaselines.length;
      warnings.push(`${cat.key} missing ${missing} baseline(s) (run: pnpm compute-baseline-stats)`);
    }
  }

  // Check pagination fitness (CL peak counts near cap)
  const CL_PAGINATION_CAP = 20;
  for (const pf of report.paginationFitness) {
    if (pf.peakWeeklyCount >= CL_PAGINATION_CAP) {
      warnings.push(
        `${pf.category} CourtListener peak=${pf.peakWeeklyCount} hits pagination cap ${CL_PAGINATION_CAP}`,
      );
    }
  }

  const { layer2Completeness: l2 } = report;
  if (l2.missingPass1 > 0) {
    warnings.push(`${l2.missingPass1} T2 docs missing L2 Pass 1 (run: pnpm layer2:backfill)`);
  }

  return warnings;
}

function printReport(report: VerifyReport): void {
  console.log('\n=== Document Coverage ===');
  const grouped = new Map<string, Map<string, number>>();
  for (const row of report.documentCoverage) {
    if (!grouped.has(row.category)) grouped.set(row.category, new Map());
    grouped.get(row.category)!.set(row.sourceOrigin, row.count);
  }
  for (const [cat, sources] of [...grouped.entries()].sort()) {
    for (const [source, count] of [...sources.entries()].sort()) {
      const mark = count > 0 ? '\u2713' : '\u2717';
      console.log(`  ${cat.padEnd(30)} ${source.padEnd(20)} ${mark} ${count}`);
    }
  }

  console.log('\n=== Stage Completeness ===');
  const s = report.stageCompleteness;
  console.log(`  Documents missing scores:      ${s.missingScores} / ${s.totalDocuments}`);
  console.log(`  Documents missing embeddings:  ${s.missingEmbeddings} / ${s.totalDocuments}`);
  console.log(`  Weeks missing aggregates:      ${s.missingAggregates} / ${s.totalWeeks}`);

  console.log('\n=== Baseline Completeness ===');
  const baselinesByConfig = new Map<string, string[]>();
  for (const b of report.baselineCompleteness) {
    if (!baselinesByConfig.has(b.baselineId)) baselinesByConfig.set(b.baselineId, []);
    baselinesByConfig.get(b.baselineId)!.push(b.category);
  }
  for (const config of BASELINE_CONFIGS) {
    const cats = baselinesByConfig.get(config.id) || [];
    console.log(`  ${config.id}: ${cats.length} / ${CATEGORIES.length} categories`);
  }

  console.log('\n=== Layer 2 Completeness ===');
  const l2 = report.layer2Completeness;
  console.log(`  T2 documents:  ${l2.totalT2Documents}`);
  console.log(`  Missing Pass 1: ${l2.missingPass1}`);
  console.log(`  Missing Pass 2: ${l2.missingPass2}`);

  if (report.paginationFitness.length > 0) {
    console.log('\n=== Pagination Fitness (CourtListener) ===');
    for (const pf of report.paginationFitness) {
      console.log(`  ${pf.category.padEnd(30)} peak=${pf.peakWeeklyCount}`);
    }
  }

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

  const [coverage, completeness, baselineStat, l2, pagination] = await Promise.all([
    getDocumentCoverage(options.category),
    getStageCompleteness(options.category),
    getBaselineCompleteness(),
    getLayer2Completeness(options.category),
    getPaginationFitness(options.category),
  ]);

  const report: VerifyReport = {
    documentCoverage: coverage,
    stageCompleteness: completeness,
    baselineCompleteness: baselineStat,
    layer2Completeness: l2,
    paginationFitness: pagination,
    warnings: [],
  };
  report.warnings = collectWarnings(report);

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
        printReport(report);
      }
      process.exit(report.warnings.length > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('[verify] Fatal error:', err);
      process.exit(1);
    });
}
