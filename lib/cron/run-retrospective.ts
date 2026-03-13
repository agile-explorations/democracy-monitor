// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';
import type { KnownEvent } from '@/lib/validation/known-events';
import { ALL_KNOWN_EVENTS, TRUMP_T1_EVENTS, TRUMP_T2_EVENTS } from '@/lib/validation/known-events';
import type { RetrospectiveResult } from '@/lib/validation/retrospective';
import { runRetrospective } from '@/lib/validation/retrospective';

function getEvents(args: string[]): KnownEvent[] {
  const eventIdx = args.indexOf('--event');
  if (eventIdx >= 0 && args[eventIdx + 1]) {
    const id = args[eventIdx + 1];
    const event = ALL_KNOWN_EVENTS.find((e) => e.id === id);
    if (!event) {
      console.error(`[retrospective] Unknown event ID: ${id}`);
      console.error(`  Available: ${ALL_KNOWN_EVENTS.map((e) => e.id).join(', ')}`);
      process.exit(1);
    }
    return [event];
  }

  const periodIdx = args.indexOf('--period');
  if (periodIdx >= 0 && args[periodIdx + 1]) {
    const period = args[periodIdx + 1];
    switch (period) {
      case 'trump_t1':
        return [...TRUMP_T1_EVENTS];
      case 'trump_t2':
        return [...TRUMP_T2_EVENTS];
      default:
        console.error(`[retrospective] Unknown period: ${period}. Use trump_t1 or trump_t2`);
        process.exit(1);
    }
  }

  if (args.includes('--all')) return [...ALL_KNOWN_EVENTS];

  console.error('[retrospective] Specify --event <id>, --period <period>, or --all');
  process.exit(1);
}

function printResults(results: RetrospectiveResult[]): void {
  const header = [
    'Event'.padEnd(8),
    'Category'.padEnd(22),
    'Stored'.padEnd(18),
    'Recomputed'.padEnd(18),
    'L1'.padStart(6),
    'L2'.padStart(6),
    'L3'.padStart(6),
    'Expected'.padEnd(18),
    'Result'.padEnd(8),
  ].join(' ');

  console.log(`\n${header}`);
  console.log('-'.repeat(header.length));

  let detected = 0;
  let missed = 0;
  let changed = 0;
  let noData = 0;

  for (const r of results) {
    const conv = r.recomputed.convergence;
    const l1 = r.recomputed.structural?.composite?.toFixed(1) ?? 'n/a';
    const l2 = r.recomputed.ai?.flagRateZScore?.toFixed(1) ?? 'n/a';
    const l3 = r.recomputed.thematic?.zScore?.toFixed(1) ?? 'n/a';
    const storedStatus = r.stored.status ?? 'NO DATA';
    const result = r.recomputedDetected ? 'HIT' : 'MISS';

    if (r.recomputedDetected) detected++;
    else if (conv.status === 'Stable' && r.stored.status === null) noData++;
    else missed++;

    if (r.statusChanged) changed++;

    const row = [
      r.event.id.padEnd(8),
      r.event.category.padEnd(22),
      storedStatus.padEnd(18),
      conv.status.padEnd(18),
      l1.padStart(6),
      l2.padStart(6),
      l3.padStart(6),
      r.event.expectedMinStatus.padEnd(18),
      result.padEnd(8),
    ].join(' ');

    console.log(row);

    if (r.statusChanged) {
      console.log(`  ^ STATUS CHANGED: ${storedStatus} → ${conv.status}`);
    }
  }

  console.log('-'.repeat(header.length));
  const total = results.length;
  const detectionRate = total > 0 ? ((detected / total) * 100).toFixed(0) : '0';
  console.log(
    `OVERALL: ${detected}/${total} detected (${detectionRate}%), ${missed} missed, ${noData} no data`,
  );
  if (changed > 0) {
    console.log(`STATUS CHANGES: ${changed} events would change status with current thresholds`);
  }

  // Show missed events detail
  const missedResults = results.filter((r) => !r.recomputedDetected && r.stored.status !== null);
  if (missedResults.length > 0) {
    console.log('\nMISSED EVENTS:');
    for (const r of missedResults) {
      const conv = r.recomputed.convergence;
      console.log(`  ${r.event.id}: ${r.event.description}`);
      console.log(`    Week ${r.weekOf} | Got ${conv.status}, needed ${r.event.expectedMinStatus}`);
      console.log(
        `    L1: ${conv.structuralElevated ? 'FIRED' : 'no'} (${r.recomputed.structural?.composite?.toFixed(2) ?? 'n/a'}) | ` +
          `L2: ${conv.aiElevated ? 'FIRED' : 'no'} (${r.recomputed.ai?.flagRateZScore?.toFixed(2) ?? 'n/a'}) | ` +
          `L3: ${conv.thematicElevated ? 'FIRED' : 'no'} (${r.recomputed.thematic?.zScore?.toFixed(2) ?? 'n/a'})`,
      );
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm retrospective [options]

Re-runs detection pipeline on known events with current thresholds.
Compares recomputed status against stored weekly_aggregates and expected status.

Options:
  --event <id>        Run single event (e.g. T2-1)
  --period <period>   Run all events in period (trump_t1, trump_t2)
  --all               Run all ${ALL_KNOWN_EVENTS.length} known events`,
  );

  loadEnvConfig(process.cwd());
  if (!isDbAvailable()) {
    console.error('[retrospective] DATABASE_URL not configured');
    process.exit(1);
  }

  const events = getEvents(args);
  console.log(`[retrospective] Running ${events.length} event(s)...`);

  const results = await runRetrospective(events);
  printResults(results);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[retrospective] Fatal:', err);
    process.exit(1);
  });
