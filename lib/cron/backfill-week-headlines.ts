/**
 * Backfill one-line event headlines for analysis weeks (#539).
 * Weeks with confirmed docs get AI headlines (gpt-4o-mini, ~$0.001/week);
 * routine weeks get the deterministic fallback. Idempotent: existing
 * generated headlines are kept unless --force.
 *
 * Usage: pnpm headlines:backfill --from 2025-01-20 --to 2026-07-10 [--force]
 */

import { ensureWeekHeadline } from '@/lib/services/week-headlines';
import { checkHelp } from '@/lib/utils/cli-help';
import { addDays, getMonday } from '@/lib/utils/date-utils';

async function main() {
  const args = process.argv.slice(2);
  const val = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : null;
  };
  const from = val('--from');
  const to = val('--to');
  const force = args.includes('--force');
  if (!from || !to) throw new Error('Scope required: --from and --to (no default scope in prod)');

  const counts = { generated: 0, routine: 0, kept: 0, failed: 0 };
  let week = getMonday(new Date(from + 'T00:00:00Z'));
  while (week <= to) {
    const { status } = await ensureWeekHeadline(week, { force });
    counts[status]++;
    week = addDays(week, 7);
  }
  console.log('[headlines-backfill] done:', JSON.stringify(counts));
  if (counts.failed > 0) process.exit(1);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv.slice(2),
    `Usage: pnpm headlines:backfill --from <date> --to <date> [--force]

Ensures every Monday-aligned week in range has a headline. --force
regenerates AI headlines (routine fallbacks always self-heal when a
week gains confirmed docs).`,
  );
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[headlines-backfill] Fatal:', err);
      process.exit(1);
    });
}
