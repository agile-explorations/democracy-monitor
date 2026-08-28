/**
 * CLI: pnpm narratives:verify [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--baseline] [--json FILE]
 *
 * Deterministic number check over STORED weekly summaries (#700): rebuilds
 * each week's FACTUAL DATA numbers from current aggregates and reports every
 * count/total the stored text states that today's data does not contain,
 * plus enumerations whose count word disagrees with the names listed.
 * Read-only. Defaults to the current term; --baseline includes baseline-era
 * weeks (report only — regeneration there is a per-invocation owner decision).
 */

import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { getDb, isDbAvailable } from '@/lib/db';
import { narratives } from '@/lib/db/schema';
import { buildVerifyReport, renderVerifyReport } from '@/lib/services/narrative-verify-report';
import type { StoredSummary } from '@/lib/services/narrative-verify-report';
import { OVERVIEW_CATEGORY } from '@/lib/types';
import type { WeeklySummaryInput } from '@/lib/types';
import { checkHelp } from '@/lib/utils/cli-help';

function argValue(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
}

async function loadStoredSummaries(from: string, to?: string): Promise<StoredSummary[]> {
  const db = getDb();
  const conditions = [
    eq(narratives.category, OVERVIEW_CATEGORY),
    sql`${narratives.version} IN ('expert', 'public')`,
    gte(narratives.weekOf, from),
  ];
  if (to) conditions.push(lte(narratives.weekOf, to));
  const rows = await db
    .select({ weekOf: narratives.weekOf, version: narratives.version, content: narratives.content })
    .from(narratives)
    .where(and(...conditions))
    .orderBy(narratives.weekOf, narratives.version);
  return rows.map((r) => ({ weekOf: String(r.weekOf), version: r.version, content: r.content }));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm narratives:verify [options]

Checks stored weekly summaries' counts and totals against today's data.

Options:
  --from <date>   First week (default 2025-01-20; --baseline lowers it to 2017-01-20)
  --to <date>     Last week (default: latest)
  --baseline      Include baseline-era weeks (report only)
  --json FILE     Also write the full report as JSON`,
  );
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const baseline = args.includes('--baseline');
  const from = argValue(args, '--from') ?? (baseline ? '2017-01-20' : T2_INAUGURATION);
  const to = argValue(args, '--to');
  const jsonPath = argValue(args, '--json');

  const { loadAllLayerData, computePreviousWeekFacts } =
    await import('@/lib/services/narrative-pipeline');
  const { weeklyFactualNumbers } = await import('@/lib/services/narrative-number-prompts');

  const rows = await loadStoredSummaries(from, to);
  const weeks = [...new Set(rows.map((r) => r.weekOf))];
  console.log(`[narratives:verify] ${rows.length} stored summaries across ${weeks.length} weeks`);

  const allowedByWeek = new Map<string, Set<number>>();
  for (const weekOf of weeks) {
    const categories = await loadAllLayerData(weekOf);
    const previous = await computePreviousWeekFacts(weekOf);
    const input: WeeklySummaryInput = {
      weekOf,
      categories,
      categoryNarratives: new Map(),
      failedCategories: [],
      previousWeekSummary: null,
      previousWeekTotalDocs: previous.totalDocs,
      previousWeekElevatedCount: previous.elevatedCount,
      previousWeekConfirmedCount: previous.confirmedCount,
    };
    allowedByWeek.set(weekOf, weeklyFactualNumbers(input));
  }

  const report = buildVerifyReport(rows, allowedByWeek);
  for (const line of renderVerifyReport(report)) console.log(line);
  if (jsonPath) {
    const { writeFileSync } = await import('fs');
    writeFileSync(jsonPath, JSON.stringify(report, null, 1));
    console.log(`[narratives:verify] report written to ${jsonPath}`);
  }
  process.exit(0);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  main().catch((err) => {
    console.error('[narratives:verify] Fatal:', err);
    process.exit(1);
  });
}
