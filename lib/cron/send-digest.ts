/**
 * CLI: pnpm digest:send --week YYYY-MM-DD
 *
 * Manually releases the weekly digest for a week whose automatic send was
 * held by the digest gate (source integrity / graph violations / aggregate
 * failures — see lib/services/digest-gate.ts). Review the stored narrative
 * first (regenerate it if the underlying data was repaired); this sends to
 * all confirmed subscribers immediately.
 */

import { isDbAvailable } from '@/lib/db';
import { checkHelp } from '@/lib/utils/cli-help';

async function main(weekOf: string): Promise<void> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const { isEmailConfigured } = await import('@/lib/services/email-service');
  if (!isEmailConfigured()) throw new Error('RESEND_API_KEY not configured — cannot send');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekOf)) throw new Error('--week must be YYYY-MM-DD');

  const { sendWeeklyDigest } = await import('@/lib/services/subscriber-service');
  const sent = await sendWeeklyDigest(weekOf);
  console.log(
    sent > 0
      ? `[digest:send] Sent week ${weekOf} digest to ${sent} subscriber(s)`
      : `[digest:send] Nothing sent for ${weekOf} — no confirmed subscribers or no stored narrative`,
  );
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm digest:send --week YYYY-MM-DD

Manually sends the stored weekly digest to confirmed subscribers — the
release path for a digest held by the snapshot's quality gate. Review the
week's narrative before running.`,
  );
  const weekIdx = argv.indexOf('--week');
  const weekOf = weekIdx >= 0 ? argv[weekIdx + 1] : '';
  if (!weekOf) {
    console.error('[digest:send] --week YYYY-MM-DD is required');
    process.exit(1);
  }
  main(weekOf).catch((err) => {
    console.error('[digest:send] Fatal:', err);
    process.exit(1);
  });
}
