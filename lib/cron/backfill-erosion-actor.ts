/**
 * Attribute erosionActor on historical confirmed P2 assessments (#537).
 *
 * Thin CLI over lib/services/actor-attribution.ts (the weekly snapshot uses
 * the same service for ongoing attribution). Writes via UPDATE-by-id — never
 * inserts, never touches assessment fields. Default selects only rows with
 * NULL erosion_actor (idempotent / resumable); --overwrite re-attributes.
 *
 * Usage:
 *   pnpm actor:backfill --dry-run --sample-stratified 100 --output pilot.json --from ... --to ...
 *   pnpm actor:backfill --from 2025-01-20 --to 2026-07-10
 *   pnpm actor:backfill --baseline biden_2022     # baseline write — user approval required
 */

import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { isDbAvailable } from '@/lib/db';
import {
  loadAttributionCandidates,
  runActorAttribution,
  stratifiedSample,
  summarizeDistribution,
} from '@/lib/services/actor-attribution';
import { checkHelp } from '@/lib/utils/cli-help';

interface Args {
  from?: string;
  to?: string;
  baseline?: string;
  category?: string;
  limit?: number;
  sampleStratified?: number;
  output?: string;
  dryRun: boolean;
  overwrite: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, overwrite: false };
  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case '--from':
        args.from = argv[++i];
        break;
      case '--to':
        args.to = argv[++i];
        break;
      case '--baseline':
        args.baseline = argv[++i];
        break;
      case '--category':
        args.category = argv[++i];
        break;
      case '--limit':
        args.limit = parseInt(argv[++i], 10);
        break;
      case '--sample-stratified':
        args.sampleStratified = parseInt(argv[++i], 10);
        break;
      case '--output':
        args.output = argv[++i];
        break;
      case '--dry-run':
        args.dryRun = true;
        break;
      case '--overwrite':
        args.overwrite = true;
        break;
    }
  }
  return args;
}

function resolveRange(args: Args): { from: string; to: string } {
  if (args.baseline) {
    const config = BASELINE_CONFIGS.find((c) => c.id === args.baseline);
    if (!config) throw new Error(`Unknown baseline: ${args.baseline}`);
    return { from: config.from, to: config.to };
  }
  if (args.from && args.to) return { from: args.from, to: args.to };
  throw new Error('Scope required: --baseline <id> or --from/--to (no default scope in prod)');
}

async function main() {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const args = parseArgs(process.argv.slice(2));
  const { from, to } = resolveRange(args);
  const opts = {
    from,
    to,
    category: args.category,
    overwrite: args.overwrite,
    dryRun: args.dryRun,
    limit: args.limit,
  };

  let candidates = await loadAttributionCandidates(opts);
  console.log(`[actor-backfill] ${candidates.length} candidate rows in scope`);
  if (args.sampleStratified) {
    candidates = stratifiedSample(candidates, args.sampleStratified);
    console.log(`[actor-backfill] stratified sample: ${candidates.length} rows`);
  }

  const run = await runActorAttribution(opts, candidates);
  console.log(`[actor-backfill] attributed ${run.results.length}/${run.candidates}`);

  if (args.output) {
    const report = run.results.map((r) => ({
      id: r.candidate.id,
      category: r.candidate.category,
      weekOf: r.candidate.weekOf,
      title: r.candidate.title,
      assessment: r.candidate.assessment,
      reasoningSnippet: (r.candidate.reasoning ?? '').slice(0, 200),
      erosionActor: r.erosionActor,
      rationale: r.rationale,
    }));
    const fs = await import('fs');
    fs.writeFileSync(args.output, JSON.stringify(report, null, 2));
    console.log(`[actor-backfill] report written to ${args.output}`);
  }

  console.log(
    '[actor-backfill] distribution:',
    JSON.stringify(
      summarizeDistribution(
        run.results.map((r) => ({ category: r.candidate.category, erosionActor: r.erosionActor })),
      ),
      null,
      1,
    ),
  );
  console.log(
    args.dryRun
      ? '[actor-backfill] DRY RUN — no writes'
      : `[actor-backfill] Done: ${run.written} rows attributed.`,
  );
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv.slice(2),
    `Usage: pnpm actor:backfill [options]

Attribute erosionActor on confirmed P2 assessments via a light gpt-4o-mini pass.
Scope is REQUIRED (--baseline or --from/--to). Baseline scopes are a production
baseline write — get explicit user approval per invocation (see CLAUDE.md).

Options:
  --from <date> --to <date>   Date range (week_of, inclusive)
  --baseline <id>             Baseline period id (e.g. biden_2022)
  --category <key>            Single category
  --limit <n>                 Cap candidate rows
  --sample-stratified <n>     Deterministic stratified sample (with --dry-run for pilots)
  --output <file>             Write per-row JSON report (pilot/audit review)
  --dry-run                   Classify + report, no DB writes
  --overwrite                 Re-attribute rows that already have erosion_actor`,
  );
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[actor-backfill] Fatal:', err);
      process.exit(1);
    });
}
