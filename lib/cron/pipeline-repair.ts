/**
 * CLI: pnpm pipeline:repair --from <date> --to <date> [options]
 *
 * DAG-aware repair orchestrator (#570). Runs the recomputation chain for a
 * date scope in dependency order with the safety harness built in:
 *
 *   pre-gates   status snapshot + NC margin capture
 *   stage 1     scores:backfill        (score unscored eligible docs)
 *   stage 2     aggregate re-derivation (gap fill + count recompute)
 *   stage 3     baselines:compute       (only when scope touches a baseline)
 *   stage 4     scores:enrich           (refresh layer scores + enriched_at)
 *   post-gates  flip gate (zero flips unless --expect-flips), NC margin
 *               regression, validate:detection, validate:graph
 *
 * Baseline-range invocations (<2025-01-20) require --confirm-baseline per
 * the standing owner-approval rule. Wrap detached runs with
 * scripts/prod-chain-template.sh for markers/retry/sentinel.
 */

import { spawnSync } from 'child_process';
import * as fs from 'fs';
import { sql } from 'drizzle-orm';
import { T2_INAUGURATION, getAnalysisPeriods } from '@/lib/data/analysis-periods';
import { getDb, isDbAvailable } from '@/lib/db';
import type { NegativeControlResult } from '@/lib/services/event-validation-checks';
import { runNegativeControls, runValidation } from '@/lib/services/event-validation-service';
import {
  captureStatuses,
  diffStatuses,
  evaluateFlipGate,
  regressedControls,
} from '@/lib/services/pipeline-repair-gates';
import type { StatusFlip } from '@/lib/services/pipeline-repair-gates';
import { computeWeeklyAggregate, storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import { checkHelp } from '@/lib/utils/cli-help';
import { runBackfillAggregateGaps } from './backfill-aggregate-gaps';
import { runGraphValidation } from './validate-graph';

interface RepairOptions {
  from: string;
  to: string;
  expectFlipsFile?: string;
  confirmBaseline: boolean;
  dryRun: boolean;
}

function runStage(label: string, pnpmArgs: string[]): void {
  console.log(`\n[pipeline:repair] === ${label}: pnpm ${pnpmArgs.join(' ')} ===`);
  const res = spawnSync('pnpm', pnpmArgs, { stdio: 'inherit' });
  if (res.status !== 0) {
    throw new Error(`stage "${label}" failed with exit ${res.status}`);
  }
}

/** Recompute counts for every aggregate row in scope (bare, enrichment-preserving). */
async function recomputeAggregateCounts(from: string, to: string): Promise<number> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const res = await db.execute(sql`
    SELECT category, week_of::text AS week_of FROM weekly_aggregates
    WHERE week_of >= ${from} AND week_of <= ${to}
    ORDER BY category, week_of`);
  const pairs = res.rows as Array<{ category: string; week_of: string }>;
  for (const p of pairs) {
    const agg = await computeWeeklyAggregate(p.category, p.week_of);
    await storeWeeklyAggregate(agg);
  }
  return pairs.length;
}

function affectedBaselines(from: string, to: string): string[] {
  return getAnalysisPeriods()
    .filter((p) => p.label !== 'trump_t2' && p.from <= to && p.to >= from)
    .map((p) => p.label);
}

function loadExpectedFlips(file?: string): StatusFlip[] {
  if (!file) return [];
  return JSON.parse(fs.readFileSync(file, 'utf8')) as StatusFlip[];
}

function printFlipGate(actual: StatusFlip[], expected: StatusFlip[]): boolean {
  const gate = evaluateFlipGate(actual, expected);
  console.log(
    `\n[pipeline:repair] Flip gate: ${actual.length} flips ` +
      `(${gate.matched.length} expected, ${gate.unexpected.length} unexpected)`,
  );
  for (const f of gate.unexpected) {
    console.log(`  ✗ UNEXPECTED ${f.category} ${f.weekOf}: ${f.from} → ${f.to}`);
  }
  for (const f of gate.missing) {
    console.log(`  ⚠ expected but did not occur: ${f.category} ${f.weekOf}: ${f.from} → ${f.to}`);
  }
  return gate.unexpected.length === 0;
}

function printNcGate(pre: NegativeControlResult[], post: NegativeControlResult[]): boolean {
  const regressed = regressedControls(pre, post);
  console.log(`\n[pipeline:repair] NC margins after repair:`);
  for (const nc of post) {
    const before = pre.find((p) => p.id === nc.id);
    const moved = before && before.actual !== nc.actual ? ` (was ${before.actual})` : '';
    console.log(
      `  ${nc.pass ? '✓' : '✗'} ${nc.id}: actual ${nc.actual}${moved} | threshold ${nc.threshold}`,
    );
  }
  for (const nc of regressed) console.log(`  ✗ REGRESSED: ${nc.id}`);
  return regressed.length === 0;
}

async function runPostValidation(): Promise<boolean> {
  const report = await runValidation({});
  const det = report.summary.controlsFailed === 0 && report.summary.eventsMissed === 0;
  if (!det) {
    console.log(
      `  ✗ validate:detection — ${report.summary.controlsFailed} controls failed, ` +
        `${report.summary.eventsMissed} events missed`,
    );
  }
  const graph = await runGraphValidation();
  const graphErrors = graph.filter((g) => !g.pass && g.severity === 'error');
  for (const g of graphErrors) console.log(`  ✗ validate:graph — ${g.id}: ${g.violations}`);
  console.log(
    `[pipeline:repair] validate:detection ${det ? '✓' : '✗'} | validate:graph ${
      graphErrors.length === 0 ? '✓' : '✗'
    }`,
  );
  return det && graphErrors.length === 0;
}

export async function runPipelineRepair(opts: RepairOptions): Promise<boolean> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const baselines = affectedBaselines(opts.from, opts.to);
  if (opts.from < T2_INAUGURATION && !opts.confirmBaseline && !opts.dryRun) {
    console.error(
      '[pipeline:repair] Scope touches baseline periods (<2025-01-20): ' +
        `${baselines.join(', ')}. Baseline writes require explicit owner approval — ` +
        'rerun with --confirm-baseline once approved.',
    );
    process.exitCode = 2;
    return false;
  }

  const expected = loadExpectedFlips(opts.expectFlipsFile);
  if (opts.dryRun) {
    console.log(
      `[pipeline:repair] DRY RUN ${opts.from}..${opts.to}\n` +
        `  stages: scores:backfill → aggregate re-derivation → ` +
        `${baselines.length ? `baselines:compute (${baselines.join(', ')}) → ` : ''}scores:enrich\n` +
        `  expected flips: ${expected.length}`,
    );
    return true;
  }

  console.log(`[pipeline:repair] capturing pre-state (statuses + NC margins)...`);
  const preStatuses = await captureStatuses(opts.from, opts.to);
  const preNc = await runNegativeControls();

  runStage('stage 1 · score backfill', ['scores:backfill', '--from', opts.from, '--to', opts.to]);
  console.log('\n[pipeline:repair] === stage 2 · aggregate re-derivation ===');
  await runBackfillAggregateGaps({ from: opts.from, to: opts.to, dryRun: false });
  const recomputed = await recomputeAggregateCounts(opts.from, opts.to);
  console.log(`[pipeline:repair] recomputed counts for ${recomputed} aggregates`);
  for (const b of baselines) {
    runStage(`stage 3 · baseline ${b}`, ['baselines:compute', '--baseline', b]);
  }
  runStage('stage 4 · enrichment', ['scores:enrich', '--from', opts.from, '--to', opts.to]);

  console.log(`\n[pipeline:repair] capturing post-state...`);
  const flips = diffStatuses(preStatuses, await captureStatuses(opts.from, opts.to));
  const flipOk = printFlipGate(flips, expected);
  const ncOk = printNcGate(preNc, await runNegativeControls());
  const validationOk = await runPostValidation();

  const pass = flipOk && ncOk && validationOk;
  console.log(`\n[pipeline:repair] ${pass ? 'ALL GATES PASS' : 'GATE FAILURE — inspect above'}`);
  return pass;
}

function parseArgs(argv: string[]): RepairOptions {
  const opts: RepairOptions = {
    from: '',
    to: '',
    confirmBaseline: false,
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--from') opts.from = argv[++i];
    else if (argv[i] === '--to') opts.to = argv[++i];
    else if (argv[i] === '--expect-flips') opts.expectFlipsFile = argv[++i];
    else if (argv[i] === '--confirm-baseline') opts.confirmBaseline = true;
    else if (argv[i] === '--dry-run') opts.dryRun = true;
  }
  if (!opts.from || !opts.to) throw new Error('--from and --to are required');
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm pipeline:repair --from <date> --to <date> [options]

Runs the recomputation DAG (scores:backfill → aggregate re-derivation →
baselines:compute → scores:enrich) for the scope, gated by a status-flip
check, NC margin regression check, validate:detection, and validate:graph.

Options:
  --from <date>         Scope start (required)
  --to <date>           Scope end (required)
  --expect-flips <file> JSON list of allowed status flips
                        [{"category","weekOf","from","to"}]; default none
  --confirm-baseline    Acknowledge owner approval for baseline-period writes
  --dry-run             Print the stage plan without writing`,
  );
  runPipelineRepair(parseArgs(argv))
    .then((pass) => {
      if (process.exitCode === undefined) process.exit(pass ? 0 : 1);
    })
    .catch((err) => {
      console.error('[pipeline:repair] Fatal:', err);
      process.exit(1);
    });
}
