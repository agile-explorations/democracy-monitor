/**
 * CLI: Retry failed narrative generations.
 *
 * Usage: pnpm narratives:retry [--category <key>] [--week <YYYY-MM-DD>]
 */

import { getUnresolvedFailures } from '@/lib/services/narrative-failure-store';
import { retryFailedNarratives } from '@/lib/services/narrative-pipeline';

function parseArgs() {
  const args = process.argv.slice(2);
  let category: string | undefined;
  let week: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--category' && args[i + 1]) category = args[++i];
    if (args[i] === '--week' && args[i + 1]) week = args[++i];
  }
  return { category, week };
}

async function main() {
  const { category, week } = parseArgs();
  const failures = await getUnresolvedFailures(category, week);

  if (failures.length === 0) {
    console.log('[narratives:retry] No unresolved failures found.');
    return;
  }

  console.log(`[narratives:retry] Found ${failures.length} unresolved failure(s):`);
  for (const f of failures) {
    console.log(`  ${f.category} week ${f.weekOf}: pass ${f.failedPass}, ${f.attempts} attempt(s)`);
  }

  // Group by weekOf to call retryFailedNarratives once per week
  const weeks = [...new Set(failures.map((f) => f.weekOf))];

  let totalResolved = 0;
  let totalFailed = 0;

  for (const weekOf of weeks) {
    const { resolved, failed } = await retryFailedNarratives(weekOf, category);
    totalResolved += resolved;
    totalFailed += failed;
  }

  console.log(`[narratives:retry] Done — ${totalResolved} resolved, ${totalFailed} failed`);
}

main().catch((err) => {
  console.error('[narratives:retry] Fatal error:', err);
  process.exit(1);
});
