/**
 * CLI: pnpm validate:data [--category <key>]
 *
 * Checks stage completeness (scores, embeddings, aggregates),
 * baseline completeness, Layer 2 assessment coverage, layer score
 * population, and metadata_only classification.
 */

import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import type {
  DataIntegrityCheck,
  DataReport,
  Layer2PeriodStats,
  LayerScorePeriodStats,
  MetadataOnlyStats,
} from '@/lib/services/data-validation-service';
import { runDataValidation } from '@/lib/services/data-validation-service';
import { checkHelp } from '@/lib/utils/cli-help';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PASS = '\u2713';
const FAIL = '\u2717';
const WARN = '\u26A0';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function printStageCompleteness(report: DataReport): void {
  console.log('\n=== Stage Completeness ===');
  const s = report.stageCompleteness;
  console.log(`  Documents missing scores:      ${s.missingScores} / ${s.totalDocuments}`);
  console.log(`  Documents missing embeddings:  ${s.missingEmbeddings} / ${s.totalDocuments}`);
  if (s.missingEmbeddingsIntent > 0) {
    console.log(
      `  Intent docs missing embeddings: ${s.missingEmbeddingsIntent} (not used in detection)`,
    );
  }
  if (s.metadataOnlyCount > 0) {
    console.log(
      `  Metadata-only (excluded):      ${s.metadataOnlyCount} (not counted in missing embeddings)`,
    );
  }
  console.log(`  Weeks missing aggregates:      ${s.missingAggregates} / ${s.totalWeeks}`);
}

function printBaselineCompleteness(report: DataReport): void {
  console.log('\n=== Baseline Completeness ===');
  const categoryKeys = new Set(CATEGORIES.map((c) => c.key));
  const baselinesByConfig = new Map<string, string[]>();
  for (const b of report.baselineCompleteness) {
    if (!categoryKeys.has(b.category)) continue;
    if (!baselinesByConfig.has(b.baselineId)) baselinesByConfig.set(b.baselineId, []);
    baselinesByConfig.get(b.baselineId)!.push(b.category);
  }
  for (const config of BASELINE_CONFIGS) {
    const bCats = baselinesByConfig.get(config.id) || [];
    const mark = bCats.length >= CATEGORIES.length ? PASS : WARN;
    console.log(`  ${mark} ${config.id}: ${bCats.length} / ${CATEGORIES.length} categories`);
  }
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
    const p1ok = p.missingPass1 === 0 ? PASS : WARN;
    const p2ok = p.missingPass2 === 0 ? PASS : WARN;
    const fnMark = p.auditFalseNegatives > 0 ? WARN : '';
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

function printLayerScorePopulation(periods: LayerScorePeriodStats[]): void {
  console.log('\n=== Layer Score Population ===');
  const hdr =
    `  ${'Period'.padEnd(22)}` +
    `${'Weeks'.padStart(8)}` +
    `${'L1'.padStart(8)}` +
    `${'L2'.padStart(8)}` +
    `${'L3'.padStart(8)}` +
    `${'Conv'.padStart(8)}` +
    `${'All 3'.padStart(8)}`;
  console.log(hdr);
  for (const p of periods) {
    const allMark = p.totalWeeks > 0 && p.withAllLayers === p.totalWeeks ? PASS : WARN;
    console.log(
      `  ${p.label.padEnd(22)}` +
        `${String(p.totalWeeks).padStart(8)}` +
        `${String(p.withStructural).padStart(8)}` +
        `${String(p.withAi).padStart(8)}` +
        `${String(p.withThematic).padStart(8)}` +
        `${String(p.withConvergence).padStart(8)}` +
        `${String(p.withAllLayers).padStart(8)} ${allMark}`,
    );
  }
}

function printMetadataOnlyClassification(stats: MetadataOnlyStats[]): void {
  console.log('\n=== metadata_only Classification ===');
  for (const m of stats) {
    const mark = m.pass ? PASS : FAIL;
    const detail =
      m.total > 0
        ? `${m.markedMetadataOnly}/${m.total} marked (${m.unmarked} unmarked)`
        : 'no documents';
    console.log(`  ${mark} ${m.population.padEnd(35)} ${detail}`);
  }
}

function printDataIntegrity(checks: DataIntegrityCheck[]): void {
  console.log('\n=== Data Integrity ===');
  for (const check of checks) {
    const mark = check.pass ? PASS : FAIL;
    const detail = check.pass ? '' : ` (${check.count}${check.detail ? ': ' + check.detail : ''})`;
    console.log(`  ${mark} ${check.name}${detail}`);
  }
}

function printReport(report: DataReport): void {
  printStageCompleteness(report);
  printBaselineCompleteness(report);
  printLayer2Completeness(report.layer2Completeness);
  printLayerScorePopulation(report.layerScorePopulation);
  printMetadataOnlyClassification(report.metadataOnlyClassification);
  printDataIntegrity(report.dataIntegrity);

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
    `Usage: pnpm validate:data [options]

Options:
  --category <key>    Filter to a single category`,
  );
  const options = parseCliArgs(argv);

  console.log('[validate:data] Running data validation...');
  if (options.category) console.log(`[validate:data] Category filter: ${options.category}`);

  runDataValidation(options.category)
    .then((report) => {
      printReport(report);
      process.exit(report.warnings.length > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error('[validate:data] Fatal error:', err);
      process.exit(1);
    });
}
