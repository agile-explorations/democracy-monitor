/**
 * Recompute layer scores for existing weekly_aggregates rows.
 *
 * Enriches rows with Layer 1 (structural), Layer 2 (AI, from stored assessments),
 * Layer 3 (thematic drift), and convergence synthesis.
 *
 * Usage:
 *   npx tsx scripts/recompute-layer-scores.ts
 *   npx tsx scripts/recompute-layer-scores.ts --baseline biden_2022
 *   npx tsx scripts/recompute-layer-scores.ts --from 2025-01-20 --to 2026-02-22
 *   npx tsx scripts/recompute-layer-scores.ts --category civilService --dry-run
 */
// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { and, eq, gte, lt } from 'drizzle-orm';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { weeklyAggregates } from '@/lib/db/schema';
import { enrichWithLayerScores, loadStoredAISummary } from '@/lib/services/layer-scoring';
import { storeWeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { WeeklyAggregate } from '@/lib/services/weekly-aggregator';

interface RecomputeArgs {
  baseline?: string;
  from?: string;
  to?: string;
  category?: string;
  dryRun: boolean;
}

function parseArgs(): RecomputeArgs {
  const args = process.argv.slice(2);
  const result: RecomputeArgs = { dryRun: false };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--baseline':
        result.baseline = args[++i];
        break;
      case '--from':
        result.from = args[++i];
        break;
      case '--to':
        result.to = args[++i];
        break;
      case '--category':
        result.category = args[++i];
        break;
      case '--dry-run':
        result.dryRun = true;
        break;
    }
  }

  return result;
}

function resolveDateRange(args: RecomputeArgs): { from?: string; to?: string } {
  if (args.baseline) {
    const config = BASELINE_CONFIGS.find((c) => c.id === args.baseline);
    if (!config) throw new Error(`Unknown baseline: ${args.baseline}`);
    return { from: config.from, to: config.to };
  }
  return { from: args.from, to: args.to };
}

async function fetchAggregateRows(
  args: RecomputeArgs,
): Promise<Array<{ category: string; weekOf: string }>> {
  const db = getDb();
  const { from, to } = resolveDateRange(args);

  const conditions = [];
  if (args.category) {
    conditions.push(eq(weeklyAggregates.category, args.category));
  }
  if (from) {
    conditions.push(gte(weeklyAggregates.weekOf, from));
  }
  if (to) {
    conditions.push(lt(weeklyAggregates.weekOf, to));
  }

  const rows = await db
    .select({
      category: weeklyAggregates.category,
      weekOf: weeklyAggregates.weekOf,
    })
    .from(weeklyAggregates)
    .where(conditions.length > 0 ? and(...conditions) : undefined)
    .orderBy(weeklyAggregates.category, weeklyAggregates.weekOf);

  return rows;
}

function rowToAggregate(row: { category: string; weekOf: string }): WeeklyAggregate {
  return {
    category: row.category,
    weekOf: row.weekOf,
    totalSeverity: 0,
    documentCount: 0,
    avgSeverityPerDoc: 0,
    captureProportion: 0,
    driftProportion: 0,
    warningProportion: 0,
    severityMix: 0,
    captureMatchCount: 0,
    driftMatchCount: 0,
    warningMatchCount: 0,
    suppressedMatchCount: 0,
    topKeywords: [],
    computedAt: new Date().toISOString(),
  };
}

async function recomputeRow(
  row: { category: string; weekOf: string },
  dryRun: boolean,
): Promise<{ status: string; convergence?: string }> {
  const aiSummary = await loadStoredAISummary(row.category, row.weekOf);
  const stub = rowToAggregate(row);
  const enriched = await enrichWithLayerScores(stub, aiSummary);

  const convergenceStatus =
    (enriched.convergenceDetail as { status?: string })?.status ?? 'unknown';

  if (!dryRun) {
    const db = getDb();
    await db
      .update(weeklyAggregates)
      .set({
        structuralScore: enriched.structuralScore ?? null,
        structuralDetail: enriched.structuralDetail ?? null,
        thematicScore: enriched.thematicScore ?? null,
        thematicDetail: enriched.thematicDetail ?? null,
        convergenceScore: enriched.convergenceScore ?? null,
        convergenceDetail: enriched.convergenceDetail ?? null,
        aiScore: enriched.aiScore ?? null,
        aiDetail: enriched.aiDetail ?? null,
      })
      .where(
        and(eq(weeklyAggregates.category, row.category), eq(weeklyAggregates.weekOf, row.weekOf)),
      );
  }

  return { status: 'ok', convergence: convergenceStatus };
}

async function main() {
  const args = parseArgs();

  if (!isDbAvailable()) {
    console.error('[recompute] Database not available');
    process.exit(1);
  }

  if (args.category && !CATEGORIES.find((c) => c.key === args.category)) {
    console.error(`[recompute] Unknown category: ${args.category}`);
    process.exit(1);
  }

  const rows = await fetchAggregateRows(args);
  console.log(
    `[recompute] Found ${rows.length} weekly_aggregates rows to process` +
      `${args.dryRun ? ' [DRY RUN]' : ''}`,
  );

  const statusCounts: Record<string, number> = {};
  let processed = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await recomputeRow(row, args.dryRun);
      const status = result.convergence ?? 'unknown';
      statusCounts[status] = (statusCounts[status] ?? 0) + 1;
      processed++;

      if (processed % 50 === 0) {
        console.log(`[recompute] Progress: ${processed}/${rows.length}`);
      }
    } catch (err) {
      failed++;
      console.warn(`[recompute] Failed ${row.category}/${row.weekOf}:`, err);
    }
  }

  console.log(`\n[recompute] Complete: ${processed} processed, ${failed} failed`);
  console.log('[recompute] Convergence distribution:');
  for (const [status, count] of Object.entries(statusCounts).sort()) {
    console.log(`  ${status}: ${count}`);
  }
}

loadEnvConfig(process.cwd());
main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[recompute] Fatal error:', err);
    process.exit(1);
  });
