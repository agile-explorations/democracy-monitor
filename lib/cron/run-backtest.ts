// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { runBacktest } from '@/lib/validation/historical-backtest';
import { TRUMP_2017_2018_EVENTS } from '@/lib/validation/known-events';

loadEnvConfig(process.cwd());

const DEFAULT_FROM = '2017-01-20';
const DEFAULT_TO = '2018-01-19';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  let from = DEFAULT_FROM;
  let to = DEFAULT_TO;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--from':
        from = args[++i];
        break;
      case '--to':
        to = args[++i];
        break;
    }
  }

  console.log(`[backtest] Running backtest: ${from} → ${to}`);
  console.log(`[backtest] Known events: ${TRUMP_2017_2018_EVENTS.length}`);

  const results = await runBacktest(from, to, TRUMP_2017_2018_EVENTS);

  if (results.length === 0) {
    console.log('[backtest] No data found for any category in this period.');
    console.log('[backtest] Run `pnpm backfill --from 2017-01-20 --to 2018-01-19` first.');
    return;
  }

  console.log(
    `\n${'Category'.padEnd(20)} ${'Detection'.padEnd(12)} ${'Detected'.padEnd(10)} ${'Missed'.padEnd(10)} ${'False Alarms'.padEnd(14)} ${'Peak Week'.padEnd(12)} Peak Score`,
  );
  console.log('-'.repeat(90));

  let totalDetected = 0;
  let totalEvents = 0;

  for (const r of results) {
    const rate = `${(r.detectionRate * 100).toFixed(0)}%`;
    console.log(
      `${r.category.padEnd(20)} ${rate.padEnd(12)} ${String(r.detectedEvents.length).padEnd(10)} ${String(r.missedEvents.length).padEnd(10)} ${String(r.falseAlarms).padEnd(14)} ${(r.peakWeek || 'n/a').padEnd(12)} ${r.peakScore.toFixed(1)}`,
    );

    totalDetected += r.detectedEvents.length;
    totalEvents += r.knownEvents.length;

    if (r.missedEvents.length > 0) {
      for (const e of r.missedEvents) {
        console.log(`  MISSED: ${e.date} — ${e.description} (expected ${e.expectedSeverity})`);
      }
    }
  }

  console.log('-'.repeat(90));
  const overallRate = totalEvents > 0 ? ((totalDetected / totalEvents) * 100).toFixed(0) : '0';
  console.log(
    `${'OVERALL'.padEnd(20)} ${(overallRate + '%').padEnd(12)} ${String(totalDetected).padEnd(10)} ${String(totalEvents - totalDetected).padEnd(10)}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backtest] Fatal error:', err);
    process.exit(1);
  });
