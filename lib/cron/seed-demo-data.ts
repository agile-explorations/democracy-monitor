/**
 * DEV/DEMO ONLY — Generates deterministic historical snapshots for UI development.
 *
 * Uses the fixture system (getDemoAssessment / getDemoIntentAssessment) with a
 * seeded PRNG to produce reproducible demo data. No network calls, no AI keys
 * required — runs in < 2 seconds for 30 days.
 *
 * Usage:
 *   pnpm demo:seed                          # degrading, 30 days
 *   pnpm demo:seed --scenario mixed --days 5
 */

// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { sql } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb } from '@/lib/db';
import { getDemoAssessment } from '@/lib/demo/fixtures/assessments';
import { getDemoIntentAssessment } from '@/lib/demo/fixtures/intent';
import type { ScenarioName } from '@/lib/demo/scenarios';
import { DEMO_SCENARIOS } from '@/lib/demo/scenarios';
import { saveIntentSnapshot } from '@/lib/services/intent-snapshot-store';
import { saveSnapshot } from '@/lib/services/snapshot-store';
import type { EnhancedAssessment, IntentAssessment, StatusLevel } from '@/lib/types';
import { toDateString } from '@/lib/utils/date-utils';

loadEnvConfig(process.cwd());

// --- Seeded PRNG (mulberry32) ------------------------------------------------

function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- Jitter helpers ----------------------------------------------------------

const STATUS_LEVELS: StatusLevel[] = ['Stable', 'Warning', 'Drift', 'Capture'];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function jitterNumber(base: number, delta: number, rand: () => number): number {
  return +(base + (rand() * 2 - 1) * delta).toFixed(4);
}

function maybeFlipStatus(status: StatusLevel, rand: () => number): StatusLevel {
  if (rand() > 0.15) return status; // 85 % chance: keep as-is
  const idx = STATUS_LEVELS.indexOf(status);
  // Move ±1 level (never out-of-bounds)
  const direction = rand() > 0.5 ? 1 : -1;
  const next = clamp(idx + direction, 0, STATUS_LEVELS.length - 1);
  return STATUS_LEVELS[next];
}

// --- Core logic --------------------------------------------------------------

function applyAssessmentJitter(
  assessment: EnhancedAssessment,
  rand: () => number,
): EnhancedAssessment {
  const status = maybeFlipStatus(assessment.status, rand);
  return {
    ...assessment,
    status,
    dataCoverage: clamp(jitterNumber(assessment.dataCoverage, 0.05, rand), 0, 1),
    dataCoverageFactors: assessment.dataCoverageFactors
      ? {
          sourceAuthority: clamp(
            jitterNumber(assessment.dataCoverageFactors.sourceAuthority, 0.03, rand),
            0,
            1,
          ),
          evidenceVolume: clamp(
            jitterNumber(assessment.dataCoverageFactors.evidenceVolume, 0.03, rand),
            0,
            1,
          ),
          patternConsistency: clamp(
            jitterNumber(assessment.dataCoverageFactors.patternConsistency, 0.03, rand),
            0,
            1,
          ),
          temporalCoverage: clamp(
            jitterNumber(assessment.dataCoverageFactors.temporalCoverage, 0.03, rand),
            0,
            1,
          ),
        }
      : undefined,
  };
}

function applyIntentJitter(assessment: IntentAssessment, rand: () => number): IntentAssessment {
  const rhetoricScore = clamp(jitterNumber(assessment.rhetoricScore, 0.1, rand), -2, 2);
  const actionScore = clamp(jitterNumber(assessment.actionScore, 0.1, rand), -2, 2);
  return {
    ...assessment,
    rhetoricScore,
    actionScore,
    gap: +Math.abs(rhetoricScore - actionScore).toFixed(2),
  };
}

// --- CLI arg parsing ---------------------------------------------------------

function parseArgs(): { scenario: ScenarioName; days: number } {
  const args = process.argv.slice(2);

  const scenarioIdx = args.indexOf('--scenario');
  const scenarioArg = scenarioIdx !== -1 ? args[scenarioIdx + 1] : 'degrading';
  const scenario: ScenarioName =
    scenarioArg && scenarioArg in DEMO_SCENARIOS ? (scenarioArg as ScenarioName) : 'degrading';

  const daysIdx = args.indexOf('--days');
  const daysArg = daysIdx !== -1 && args[daysIdx + 1] ? parseInt(args[daysIdx + 1], 10) : 30;
  const days = isNaN(daysArg) ? 30 : daysArg;

  return { scenario, days };
}

// --- Main --------------------------------------------------------------------

export async function seedDemoData(
  days: number,
  scenario: ScenarioName = 'degrading',
): Promise<void> {
  const rand = mulberry32(42);
  const now = new Date();
  let total = 0;

  console.log(
    `[seed-demo] Generating ${days} days × ${CATEGORIES.length} categories (scenario: ${scenario})`,
  );

  // Clear old snapshot data so stale rows don't shadow new seeds
  const db = getDb();
  await db.execute(sql`TRUNCATE assessments, intent_assessments`);
  console.log('[seed-demo] Cleared existing snapshot data');

  for (let d = days; d >= 0; d--) {
    const date = new Date(now);
    date.setDate(date.getDate() - d);
    date.setHours(6, 0, 0, 0);
    const dateStr = toDateString(date);

    for (const cat of CATEGORIES) {
      const base = getDemoAssessment(cat.key, scenario, true) as EnhancedAssessment;
      base.assessedAt = date.toISOString();
      const jittered = applyAssessmentJitter(base, rand);
      await saveSnapshot(jittered, date);
      total++;
    }

    // Intent snapshot per day
    const baseIntent = getDemoIntentAssessment(scenario);
    baseIntent.assessedAt = date.toISOString();
    const jitteredIntent = applyIntentJitter(baseIntent, rand);
    await saveIntentSnapshot(jitteredIntent, date);

    console.log(`[seed-demo]   ${dateStr} ✓`);
  }

  console.log(`\n[seed-demo] Done: ${total} category + ${days + 1} intent snapshots`);
}

if (require.main === module) {
  const { days, scenario } = parseArgs();
  seedDemoData(days, scenario)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed-demo] Fatal error:', err);
      process.exit(1);
    });
}
