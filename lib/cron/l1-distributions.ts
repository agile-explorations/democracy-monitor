// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { and, gte, lte, sql } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { weeklyAggregates } from '@/lib/db/schema';
import {
  getStructuralThreshold,
  STRUCTURAL_ANOMALY_THRESHOLD,
} from '@/lib/methodology/scoring-config';
import { checkHelp } from '@/lib/utils/cli-help';

const BIDEN_2022_FROM = '2022-01-20';
const BIDEN_2022_TO = '2023-01-19';

interface CategoryStats {
  category: string;
  weeks: number;
  avgDocsPerWeek: number;
  mean: number;
  stddev: number;
  p50: number;
  p95: number;
  max: number;
  elevatedCount: number;
  elevatedPct: number;
  threshold: number;
  isThin: boolean;
  nc3Limit: number;
  nc3Pass: boolean;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (idx - lower);
}

function printTable(stats: CategoryStats[]): void {
  const header = [
    'Category'.padEnd(24),
    'Weeks'.padStart(5),
    'AvgDoc'.padStart(7),
    'Mean'.padStart(6),
    'StdDev'.padStart(7),
    'P50'.padStart(6),
    'P95'.padStart(6),
    'Max'.padStart(6),
    'Thresh'.padStart(6),
    'L1>T'.padStart(5),
    'L1%'.padStart(6),
    'Thin'.padStart(5),
    'NC3'.padStart(4),
  ].join(' ');

  console.log(header);
  console.log('-'.repeat(header.length));

  for (const s of stats) {
    const row = [
      s.category.padEnd(24),
      String(s.weeks).padStart(5),
      s.avgDocsPerWeek.toFixed(0).padStart(7),
      s.mean.toFixed(2).padStart(6),
      s.stddev.toFixed(2).padStart(7),
      s.p50.toFixed(2).padStart(6),
      s.p95.toFixed(2).padStart(6),
      s.max.toFixed(2).padStart(6),
      s.threshold.toFixed(1).padStart(6),
      String(s.elevatedCount).padStart(5),
      `${s.elevatedPct.toFixed(1)}%`.padStart(6),
      (s.isThin ? 'YES' : '').padStart(5),
      (s.nc3Pass ? 'PASS' : 'FAIL').padStart(4),
    ].join(' ');
    console.log(row);
  }
}

function suggestThresholds(
  stats: CategoryStats[],
  byCat: Map<string, Array<{ score: number; docs: number; status: string | null }>>,
): void {
  const failing = stats.filter((s) => !s.nc3Pass);
  if (failing.length === 0) return;

  console.log('Suggested threshold adjustments for failing categories:');
  for (const s of failing) {
    const scores = (byCat.get(s.category) ?? []).map((d) => d.score).sort((a, b) => a - b);
    const maxAllowed = Math.floor(s.weeks * (s.nc3Limit / 100));
    // We need elevatedCount <= maxAllowed, so threshold >= scores[scores.length - maxAllowed - 1]
    const targetIdx = scores.length - maxAllowed - 1;
    const suggestedThreshold =
      targetIdx >= 0 ? Math.ceil(scores[targetIdx] * 10) / 10 : s.threshold;
    console.log(
      `  ${s.category}: current ${s.threshold.toFixed(1)} -> suggested ${suggestedThreshold.toFixed(1)} (would allow ${maxAllowed} elevated weeks of ${s.weeks})`,
    );
  }
}

type CatRow = { score: number; docs: number; status: string | null };

function computeStats(byCat: Map<string, CatRow[]>): CategoryStats[] {
  const stats: CategoryStats[] = [];
  const elevatedStatuses = new Set(['Elevated', 'Divergent', 'ConfirmedConcern']);

  for (const cat of CATEGORIES) {
    const data = byCat.get(cat.key) ?? [];
    if (data.length === 0) continue;

    const scores = data.map((d) => d.score).sort((a, b) => a - b);
    const totalDocs = data.reduce((s, d) => s + d.docs, 0);
    const avgDocs = totalDocs / data.length;
    const m = scores.reduce((s, v) => s + v, 0) / scores.length;
    const sd = Math.sqrt(scores.reduce((s, v) => s + (v - m) ** 2, 0) / scores.length);
    const threshold = getStructuralThreshold(cat.key);
    const elevated = scores.filter((s) => s > threshold).length;
    const isThin = avgDocs < 20;
    const nc3Limit = isThin ? 0.1 : 0.05;
    const convergenceElevated = data.filter(
      (d) => d.status && elevatedStatuses.has(d.status),
    ).length;

    stats.push({
      category: cat.key,
      weeks: data.length,
      avgDocsPerWeek: avgDocs,
      mean: m,
      stddev: sd,
      p50: percentile(scores, 50),
      p95: percentile(scores, 95),
      max: scores[scores.length - 1],
      elevatedCount: elevated,
      elevatedPct: (elevated / data.length) * 100,
      threshold,
      isThin,
      nc3Limit: nc3Limit * 100,
      nc3Pass: convergenceElevated / data.length <= nc3Limit,
    });
  }

  stats.sort((a, b) => {
    if (a.nc3Pass !== b.nc3Pass) return a.nc3Pass ? 1 : -1;
    return b.elevatedPct - a.elevatedPct;
  });

  return stats;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  checkHelp(
    args,
    `Usage: pnpm l1:distributions

Shows per-category structural score distributions from Biden 2022 baseline.
Used to set per-category thresholds for NC-3 compliance.`,
  );

  loadEnvConfig(process.cwd());
  if (!isDbAvailable()) {
    console.error('[l1:distributions] DATABASE_URL not configured');
    process.exit(1);
  }

  const db = getDb();
  const rows = await db
    .select({
      category: weeklyAggregates.category,
      structuralScore: weeklyAggregates.structuralScore,
      documentCount: weeklyAggregates.documentCount,
      status: sql<string>`${weeklyAggregates.convergenceDetail}->>'status'`,
    })
    .from(weeklyAggregates)
    .where(
      and(
        gte(weeklyAggregates.weekOf, BIDEN_2022_FROM),
        lte(weeklyAggregates.weekOf, BIDEN_2022_TO),
      ),
    );

  const byCat = new Map<string, CatRow[]>();
  for (const row of rows) {
    if (!byCat.has(row.category)) byCat.set(row.category, []);
    byCat.get(row.category)!.push({
      score: Number(row.structuralScore ?? 0),
      docs: row.documentCount ?? 0,
      status: row.status,
    });
  }

  const stats = computeStats(byCat);

  console.log(
    `\nL1 Structural Score Distributions -- Biden 2022 (${BIDEN_2022_FROM} -> ${BIDEN_2022_TO})`,
  );
  console.log(`Global threshold: ${STRUCTURAL_ANOMALY_THRESHOLD}\n`);

  printTable(stats);

  console.log(
    `\nCategories with L1 > threshold: ${stats.filter((s) => s.elevatedCount > 0).length}/${stats.length}`,
  );
  console.log(`NC-3 status: ${stats.filter((s) => s.nc3Pass).length}/${stats.length} passing\n`);

  suggestThresholds(stats, byCat);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[l1:distributions] Fatal:', err);
    process.exit(1);
  });
