/**
 * CLI: Retry failed narrative generations.
 *
 * Usage: pnpm narratives:retry [--category <key>] [--week <YYYY-MM-DD>]
 */

import {
  getUnresolvedFailures,
  recordFailure,
  resolveFailure,
} from '@/lib/services/narrative-failure-store';
import { isElevatedStatus } from '@/lib/services/narrative-generation-service';
import { generateMultiPassNarrative } from '@/lib/services/narrative-multipass';
import { loadAllLayerData } from '@/lib/services/narrative-pipeline';
import { enrichCategoryData } from '@/lib/services/narrative-queries';
import { storeMultiPassNarratives } from '@/lib/services/narrative-store';
import { formatError } from '@/lib/utils/api-helpers';

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

  // Group by weekOf to load layer data once per week
  const byWeek = new Map<string, typeof failures>();
  for (const f of failures) {
    const list = byWeek.get(f.weekOf) ?? [];
    list.push(f);
    byWeek.set(f.weekOf, list);
  }

  let resolved = 0;
  let failed = 0;

  for (const [weekOf, weekFailures] of byWeek) {
    const allData = await loadAllLayerData(weekOf);
    const dataMap = new Map(allData.map((d) => [d.category, d]));

    for (const failure of weekFailures) {
      const data = dataMap.get(failure.category);
      if (!data) {
        console.warn(`[narratives:retry] No layer data for ${failure.category} week ${weekOf}`);
        failed++;
        continue;
      }

      if (!isElevatedStatus(data.convergenceDetail)) {
        console.log(`[narratives:retry] ${failure.category}: no longer elevated, resolving`);
        await resolveFailure(failure.category, weekOf);
        resolved++;
        continue;
      }

      try {
        await enrichCategoryData(data);
        const result = await generateMultiPassNarrative(data);
        await storeMultiPassNarratives(failure.category, weekOf, result);
        await resolveFailure(failure.category, weekOf);
        resolved++;
        console.log(`[narratives:retry] ${failure.category} week ${weekOf}: SUCCESS`);
      } catch (err) {
        const passInfo = (err as { passInfo?: { pass: number } }).passInfo;
        const pass = passInfo?.pass ?? 0;
        await recordFailure(failure.category, weekOf, pass, formatError(err));
        failed++;
        console.error(
          `[narratives:retry] ${failure.category} week ${weekOf}: FAILED (pass ${pass})`,
        );
      }
    }
  }

  console.log(`[narratives:retry] Done — ${resolved} resolved, ${failed} failed`);
}

main().catch((err) => {
  console.error('[narratives:retry] Fatal error:', err);
  process.exit(1);
});
