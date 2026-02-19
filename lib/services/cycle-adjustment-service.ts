/**
 * Cycle adjustment service.
 *
 * Computes severity/volume ratios between presidential-term cycle years
 * (e.g. Year 1 vs Year 2) to adjust volume thresholds in the assessment
 * pipeline. This prevents false signals when comparing Trump 2025 (Year 1)
 * against the Biden 2022 (Year 2) primary baseline.
 */

import { eq, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { baselines, cycleAdjustmentFactors } from '@/lib/db/schema';
import { mean, roundTo } from '@/lib/utils/math';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CycleAdjustmentFactor {
  category: string;
  cycleYear: number;
  referenceCycleYear: number;
  severityRatio: number;
  volumeRatio: number;
  severityStddevRatio: number;
  sourceBaselines: string[];
  sampleSize: number;
  confidence: 'low' | 'moderate' | 'high';
}

interface BaselineRow {
  baselineId: string;
  category: string;
  avgWeeklySeverity: number;
  stddevWeeklySeverity: number;
  avgWeeklyDocCount: number;
  cycleYear: number | null;
}

// ---------------------------------------------------------------------------
// Pure functions (no I/O)
// ---------------------------------------------------------------------------

export function classifyConfidence(sampleSize: number): 'low' | 'moderate' | 'high' {
  if (sampleSize >= 3) return 'high';
  if (sampleSize >= 2) return 'moderate';
  return 'low';
}

export function computeRatios(
  targetBaselines: BaselineRow[],
  referenceBaselines: BaselineRow[],
): { severityRatio: number; volumeRatio: number; severityStddevRatio: number } {
  if (targetBaselines.length === 0 || referenceBaselines.length === 0) {
    return { severityRatio: 1, volumeRatio: 1, severityStddevRatio: 1 };
  }

  const targetSeverity = mean(targetBaselines.map((b) => b.avgWeeklySeverity));
  const refSeverity = mean(referenceBaselines.map((b) => b.avgWeeklySeverity));

  const targetVolume = mean(targetBaselines.map((b) => b.avgWeeklyDocCount));
  const refVolume = mean(referenceBaselines.map((b) => b.avgWeeklyDocCount));

  const targetStddev = mean(targetBaselines.map((b) => b.stddevWeeklySeverity));
  const refStddev = mean(referenceBaselines.map((b) => b.stddevWeeklySeverity));

  return {
    severityRatio: refSeverity === 0 ? 1 : roundTo(targetSeverity / refSeverity, 4),
    volumeRatio: refVolume === 0 ? 1 : roundTo(targetVolume / refVolume, 4),
    severityStddevRatio: refStddev === 0 ? 1 : roundTo(targetStddev / refStddev, 4),
  };
}

// ---------------------------------------------------------------------------
// DB functions
// ---------------------------------------------------------------------------

function groupByCategoryAndCycle(
  rows: BaselineRow[],
): Record<string, Record<number, BaselineRow[]>> {
  const grouped: Record<string, Record<number, BaselineRow[]>> = {};
  for (const row of rows) {
    if (row.cycleYear == null) continue;
    if (!grouped[row.category]) grouped[row.category] = {};
    if (!grouped[row.category][row.cycleYear]) grouped[row.category][row.cycleYear] = [];
    grouped[row.category][row.cycleYear].push(row);
  }
  return grouped;
}

function buildFactors(
  grouped: Record<string, Record<number, BaselineRow[]>>,
  primaryCycleYear: number,
): CycleAdjustmentFactor[] {
  const factors: CycleAdjustmentFactor[] = [];
  for (const [category, byCycle] of Object.entries(grouped)) {
    const refBaselines = byCycle[primaryCycleYear] ?? [];
    for (const [yearStr, targetBaselines] of Object.entries(byCycle)) {
      const cycleYear = Number(yearStr);
      if (cycleYear === primaryCycleYear) continue;
      const ratios = computeRatios(targetBaselines, refBaselines);
      factors.push({
        category,
        cycleYear,
        referenceCycleYear: primaryCycleYear,
        ...ratios,
        sourceBaselines: targetBaselines.map((b) => b.baselineId),
        sampleSize: targetBaselines.length,
        confidence: classifyConfidence(targetBaselines.length),
      });
    }
  }
  return factors;
}

async function upsertFactors(
  db: ReturnType<typeof getDb>,
  factors: CycleAdjustmentFactor[],
): Promise<void> {
  for (const f of factors) {
    await db
      .insert(cycleAdjustmentFactors)
      .values({
        category: f.category,
        cycleYear: f.cycleYear,
        referenceCycleYear: f.referenceCycleYear,
        severityRatio: f.severityRatio,
        volumeRatio: f.volumeRatio,
        severityStddevRatio: f.severityStddevRatio,
        sourceBaselines: f.sourceBaselines,
        sampleSize: f.sampleSize,
        confidence: f.confidence,
        computedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [
          cycleAdjustmentFactors.category,
          cycleAdjustmentFactors.cycleYear,
          cycleAdjustmentFactors.referenceCycleYear,
        ],
        set: {
          severityRatio: sql`excluded.severity_ratio`,
          volumeRatio: sql`excluded.volume_ratio`,
          severityStddevRatio: sql`excluded.severity_stddev_ratio`,
          sourceBaselines: sql`excluded.source_baselines`,
          sampleSize: sql`excluded.sample_size`,
          confidence: sql`excluded.confidence`,
          computedAt: sql`excluded.computed_at`,
        },
      });
  }
}

export async function computeCycleAdjustmentFactors(
  primaryCycleYear: number,
): Promise<CycleAdjustmentFactor[]> {
  if (!isDbAvailable()) return [];

  const db = getDb();
  const rows = await db
    .select({
      baselineId: baselines.baselineId,
      category: baselines.category,
      avgWeeklySeverity: baselines.avgWeeklySeverity,
      stddevWeeklySeverity: baselines.stddevWeeklySeverity,
      avgWeeklyDocCount: baselines.avgWeeklyDocCount,
      cycleYear: baselines.cycleYear,
    })
    .from(baselines);

  const grouped = groupByCategoryAndCycle(rows);
  const factors = buildFactors(grouped, primaryCycleYear);
  await upsertFactors(db, factors);
  return factors;
}

export async function loadCycleAdjustmentFactors(
  currentCycleYear: number,
  primaryBaselineCycleYear: number,
): Promise<Map<string, CycleAdjustmentFactor>> {
  const map = new Map<string, CycleAdjustmentFactor>();
  if (!isDbAvailable() || currentCycleYear === primaryBaselineCycleYear) return map;

  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(cycleAdjustmentFactors)
      .where(eq(cycleAdjustmentFactors.cycleYear, currentCycleYear));

    for (const row of rows) {
      map.set(row.category, {
        category: row.category,
        cycleYear: row.cycleYear,
        referenceCycleYear: row.referenceCycleYear,
        severityRatio: row.severityRatio,
        volumeRatio: row.volumeRatio,
        severityStddevRatio: row.severityStddevRatio,
        sourceBaselines: row.sourceBaselines as string[],
        sampleSize: row.sampleSize,
        confidence: row.confidence as 'low' | 'moderate' | 'high',
      });
    }
  } catch (err) {
    console.warn('Failed to load cycle adjustment factors, using defaults:', err);
  }

  return map;
}

export async function getCycleAdjustment(
  category: string,
  currentCycleYear: number,
  primaryBaselineCycleYear: number,
): Promise<CycleAdjustmentFactor | null> {
  const factors = await loadCycleAdjustmentFactors(currentCycleYear, primaryBaselineCycleYear);
  return factors.get(category) ?? null;
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const { PRIMARY_BASELINE_CYCLE_YEAR } = require('@/lib/methodology/scoring-config');

  computeCycleAdjustmentFactors(PRIMARY_BASELINE_CYCLE_YEAR)
    .then((factors) => {
      console.log(`Computed ${factors.length} cycle adjustment factors:`);
      for (const f of factors) {
        console.log(
          `  ${f.category} Year ${f.cycleYear} vs Year ${f.referenceCycleYear}: ` +
            `severity=${f.severityRatio}x volume=${f.volumeRatio}x stddev=${f.severityStddevRatio}x ` +
            `(${f.confidence}, n=${f.sampleSize})`,
        );
      }
      process.exit(0);
    })
    .catch((err) => {
      console.error('Failed to compute cycle adjustment factors:', err);
      process.exit(1);
    });
}
