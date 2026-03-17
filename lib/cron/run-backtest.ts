// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { checkHelp } from '@/lib/utils/cli-help';
import { runBacktest } from '@/lib/validation/historical-backtest';
import { TRUMP_T1_EVENTS } from '@/lib/validation/known-events';

const savedDbUrl = process.env.DATABASE_URL;
loadEnvConfig(process.cwd());
if (savedDbUrl) process.env.DATABASE_URL = savedDbUrl;

const DEFAULT_FROM = '2017-01-20';
const DEFAULT_TO = '2018-01-19';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm backtest [options]

Options:
  --from <date>       Start date (YYYY-MM-DD, default: 2017-01-20)
  --to <date>         End date (YYYY-MM-DD, default: 2018-01-19)`,
  );
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
  console.log(`[backtest] Known events: ${TRUMP_T1_EVENTS.length}`);

  const results = await runBacktest(from, to, TRUMP_T1_EVENTS);

  if (results.length === 0) {
    console.log('[backtest] No data found for any category in this period.');
    console.log('[backtest] Run `pnpm backfill --from 2017-01-20 --to 2018-01-19` first.');
    return;
  }

  printResults(results);
}

function printResults(results: Awaited<ReturnType<typeof runBacktest>>): void {
  const hdr =
    `${'Category'.padEnd(22)}` +
    `${'Detect'.padStart(7)}` +
    `${'Hit'.padStart(5)}` +
    `${'Miss'.padStart(6)}` +
    `${'Elev'.padStart(6)}` +
    `${'Noise'.padStart(7)}` +
    `${'Precis'.padStart(8)}` +
    `${'FA(D+)'.padStart(8)}` +
    `${'Peak'.padStart(12)}`;
  console.log(`\n${hdr}`);
  console.log('-'.repeat(hdr.length));

  let totalDetected = 0;
  let totalEvents = 0;

  for (const r of results) {
    const rate = `${(r.detectionRate * 100).toFixed(0)}%`;
    const noise = `${(r.baselineNoise * 100).toFixed(0)}%`;
    const precision = `${(r.signalPrecision * 100).toFixed(0)}%`;
    console.log(
      `${r.category.padEnd(22)}` +
        `${rate.padStart(7)}` +
        `${String(r.detectedEvents.length).padStart(5)}` +
        `${String(r.missedEvents.length).padStart(6)}` +
        `${String(r.totalElevatedWeeks).padStart(6)}` +
        `${noise.padStart(7)}` +
        `${precision.padStart(8)}` +
        `${String(r.falseAlarms).padStart(8)}` +
        `${(r.peakWeek || 'n/a').padStart(12)}`,
    );

    totalDetected += r.detectedEvents.length;
    totalEvents += r.knownEvents.length;

    if (r.missedEvents.length > 0) {
      for (const m of r.missedEvents) {
        const reasonTag = m.missReason === 'scoring_miss' ? '' : ` [${m.missReason}]`;
        console.log(
          `  MISSED: ${m.event.date} — ${m.event.description} (expected ${m.event.expectedMinStatus})${reasonTag}`,
        );
      }
    }
  }

  console.log('-'.repeat(hdr.length));
  const overallRate = totalEvents > 0 ? ((totalDetected / totalEvents) * 100).toFixed(0) : '0';
  console.log(
    `${'OVERALL'.padEnd(22)}` +
      `${(overallRate + '%').padStart(7)}` +
      `${String(totalDetected).padStart(5)}` +
      `${String(totalEvents - totalDetected).padStart(6)}`,
  );

  printLegend();
}

function printLegend(): void {
  console.log(`\nMetrics:`);
  console.log(`  Detect  = Event sensitivity (detected / total known events)`);
  console.log(`  Elev    = Total Elevated+ weeks (event + non-event)`);
  console.log(`  Noise   = Baseline noise (non-event elevated / total weeks)`);
  console.log(`  Precis  = Signal precision (event-elevated / all elevated)`);
  console.log(`  FA(D+)  = False alarms (Divergent+ non-event weeks, legacy metric)`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[backtest] Fatal error:', err);
    process.exit(1);
  });
