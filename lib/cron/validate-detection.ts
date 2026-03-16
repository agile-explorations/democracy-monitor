/**
 * CLI: pnpm validate:detection [--category <key>] [--verbose] [--evidence]
 *
 * Runs known-event detection, negative controls, and layer attribution
 * against the local database. Reports pass/fail for each check.
 */

import type {
  LayerAttribution,
  NegativeControlResult,
} from '@/lib/services/event-validation-checks';
import type {
  ValidationReport,
  PopulationSummary,
  ValidateOptions,
} from '@/lib/services/event-validation-service';
import { runValidation } from '@/lib/services/event-validation-service';
import { checkHelp } from '@/lib/utils/cli-help';

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

const PASS = '\u2713';
const FAIL = '\u2717';
const WARN = '\u26A0';
const SKIP = '-';

function statusIcon(detected: boolean, hasData: boolean): string {
  if (!hasData) return SKIP;
  return detected ? PASS : FAIL;
}

function layerIcon(fired: boolean, score: number | null): string {
  if (score === null) return SKIP;
  return fired ? PASS : '\u00B7';
}

function printPopulation(pop: PopulationSummary): void {
  console.log('\n=== Layer Score Population ===');
  console.log(`  Total T2 category-weeks:    ${pop.totalWeeks}`);
  console.log(`  With structural score (L1): ${pop.withStructural}`);
  console.log(`  With AI score (L2):         ${pop.withAi}`);
  console.log(`  With thematic score (L3):   ${pop.withThematic}`);
  console.log(`  With all three layers:      ${pop.withAllLayers}`);
  const pct = pop.totalWeeks > 0 ? ((pop.withAi / pop.totalWeeks) * 100).toFixed(0) : '0';
  const mark = pop.sufficient ? PASS : WARN;
  console.log(`  AI coverage: ${pct}% ${mark}`);
}

function printNegativeControls(controls: NegativeControlResult[]): void {
  console.log('\n=== Negative Controls ===');
  for (const nc of controls) {
    const mark = nc.pass ? PASS : FAIL;
    console.log(`  ${mark} ${nc.id}: ${nc.description}`);
    console.log(`    Actual: ${nc.actual}  |  Threshold: ${nc.threshold}`);
    if (nc.details && !nc.pass) {
      const failing = nc.details.filter((d) => !d.pass);
      for (const d of failing.slice(0, 5)) {
        console.log(`    ${FAIL} ${d.category}: ${(d.value * 100).toFixed(1)}%`);
      }
      if (failing.length > 5) {
        console.log(`    ... and ${failing.length - 5} more`);
      }
    }
  }
}

function printEventDetection(events: LayerAttribution[], verbose: boolean): void {
  console.log('\n=== Known Event Detection ===');
  const STATUS_WIDTH = 42;
  const hdr =
    `  ${'ID'.padEnd(8)}` +
    `${'Date'.padEnd(12)}` +
    `${'Category'.padEnd(26)}` +
    `${'Status'.padEnd(STATUS_WIDTH)}` +
    `${'L1'.padStart(4)}` +
    `${'L2'.padStart(4)}` +
    `${'L3'.padStart(4)}` +
    `${'Det'.padStart(5)}`;
  console.log(hdr);

  for (const e of events) {
    const hasData = e.convergenceStatus !== null;
    const status = e.convergenceStatus ?? 'no data';
    const statusText = e.detected ? status : `${status} (expected ≥${e.expectedMinStatus})`;
    const det = statusIcon(e.detected, hasData);
    const l1 = layerIcon(e.l1Fired, e.structuralScore);
    const l2 = layerIcon(e.l2Fired, e.aiScore);
    const l3 = layerIcon(e.l3Fired, e.thematicScore);

    console.log(
      `  ${e.eventId.padEnd(8)}` +
        `${e.eventDate.padEnd(12)}` +
        `${e.category.padEnd(26)}` +
        `${statusText.padEnd(STATUS_WIDTH)}` +
        `${l1.padStart(4)}` +
        `${l2.padStart(4)}` +
        `${l3.padStart(4)}` +
        `${det.padStart(5)}`,
    );
    console.log(`           ${e.description}`);

    if (verbose) {
      const scores = [
        e.structuralScore !== null ? `L1=${e.structuralScore.toFixed(2)}` : 'L1=null',
        e.aiScore !== null ? `L2=${e.aiScore.toFixed(2)}` : 'L2=null',
        e.thematicScore !== null ? `L3=${e.thematicScore.toFixed(2)}` : 'L3=null',
      ].join('  ');
      console.log(`           ${scores}`);
      if (e.notes) console.log(`           Note: ${e.notes}`);
    }
  }

  console.log('');
  console.log(
    `  Legend: ${PASS} layer fired / event detected   \u00B7 layer below threshold   ${FAIL} event missed   ${SKIP} no data`,
  );
}

function printDetectionBreakdown(events: LayerAttribution[]): void {
  // By period
  const byPeriod = new Map<string, { detected: number; total: number }>();
  for (const e of events) {
    const period = e.eventId.startsWith('T1-') ? 'Trump T1' : 'Trump T2';
    if (!byPeriod.has(period)) byPeriod.set(period, { detected: 0, total: 0 });
    const entry = byPeriod.get(period)!;
    entry.total++;
    if (e.detected) entry.detected++;
  }
  console.log('\n=== Detection by Period ===');
  for (const [period, data] of byPeriod) {
    const pct = data.total > 0 ? ((data.detected / data.total) * 100).toFixed(0) : '0';
    const mark = data.detected === data.total ? PASS : WARN;
    console.log(`  ${mark} ${period.padEnd(12)} ${data.detected}/${data.total} detected (${pct}%)`);
  }

  // By category — only show categories with misses
  const byCat = new Map<string, { detected: number; total: number }>();
  for (const e of events) {
    if (!byCat.has(e.category)) byCat.set(e.category, { detected: 0, total: 0 });
    const entry = byCat.get(e.category)!;
    entry.total++;
    if (e.detected) entry.detected++;
  }
  const missed = [...byCat.entries()]
    .filter(([, d]) => d.detected < d.total)
    .sort(([, a], [, b]) => a.detected / a.total - b.detected / b.total);
  if (missed.length > 0) {
    console.log('\n=== Misses by Category ===');
    for (const [cat, data] of missed) {
      const pct = ((data.detected / data.total) * 100).toFixed(0);
      console.log(`  ${FAIL} ${cat.padEnd(26)} ${data.detected}/${data.total} detected (${pct}%)`);
    }
  }
}

function printSummary(report: ValidationReport): void {
  const s = report.summary;
  console.log('\n=== Summary ===');
  console.log(`  Negative controls:  ${s.controlsPassed} passed, ${s.controlsFailed} failed`);
  console.log(
    `  Event detection:    ${s.eventsDetected}/${s.totalEvents} detected, ${s.eventsMissed} missed, ${s.eventsSkipped} skipped (no data)`,
  );

  if (report.warnings.length > 0) {
    console.log(`\n=== Warnings ===`);
    for (const w of report.warnings) {
      console.log(`  ${WARN} ${w}`);
    }
  }
}

function printEvidence(report: ValidationReport): void {
  if (report.evidence.length === 0) return;
  console.log('\n=== Evidence (top P2 docs per detected event) ===');
  for (const ev of report.evidence) {
    console.log(`\n  ${ev.eventId} / ${ev.category} / ${ev.weekOf}:`);
    for (const doc of ev.documents) {
      const erosion = doc.erosionType ? ` [${doc.erosionType}]` : '';
      console.log(`    ${doc.assessment}${erosion}: ${doc.title}`);
      console.log(`      Source: ${doc.sourceType}`);
      if (doc.reasoning) {
        console.log(`      ${doc.reasoning.slice(0, 200)}...`);
      }
    }
  }
}

function printReport(report: ValidationReport, options: CliOptions): void {
  printPopulation(report.populationSummary);
  printNegativeControls(report.negativeControls);
  printEventDetection(report.eventDetection, !!options.verbose);
  if (options.evidence) printEvidence(report);
  printDetectionBreakdown(report.eventDetection);
  printSummary(report);
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions extends ValidateOptions {
  verbose?: boolean;
}

function parseCliArgs(args: string[]): CliOptions {
  const opts: CliOptions = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--category') opts.category = args[++i];
    else if (arg === '--verbose') opts.verbose = true;
    else if (arg === '--evidence') opts.evidence = true;
  }
  return opts;
}

if (require.main === module) {
  const savedDbUrl = process.env.DATABASE_URL;
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  if (savedDbUrl) process.env.DATABASE_URL = savedDbUrl;
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm validate:detection [options]

Options:
  --category <key>    Filter to a single category
  --verbose           Show detailed output
  --evidence          Show supporting evidence for each event`,
  );
  const options = parseCliArgs(argv);

  console.log('[validate:detection] Running detection validation...');
  if (options.category) console.log(`[validate:detection] Category filter: ${options.category}`);

  runValidation(options)
    .then((report) => {
      printReport(report, options);
      const hasFailures = report.summary.controlsFailed > 0 || report.warnings.length > 0;
      process.exit(hasFailures ? 1 : 0);
    })
    .catch((err) => {
      console.error('[validate:detection] Fatal error:', err);
      process.exit(1);
    });
}
