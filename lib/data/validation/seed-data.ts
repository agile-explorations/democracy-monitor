import { isDbAvailable, getDb } from '@/lib/db';
import { validationDataPoints } from '@/lib/db/schema';
import type { ValidationDataPoint } from '@/lib/types/validation';

/**
 * Representative validation data points from external democracy indices.
 * Values sourced from publicly available annual reports.
 */
export const SEED_VALIDATION_DATA: ValidationDataPoint[] = [
  // V-Dem Liberal Democracy Index (USA)
  { source: 'v-dem', date: '2020-12-31', dimension: 'liberal_democracy', score: 0.82 },
  { source: 'v-dem', date: '2021-12-31', dimension: 'liberal_democracy', score: 0.79 },
  { source: 'v-dem', date: '2022-12-31', dimension: 'liberal_democracy', score: 0.78 },
  { source: 'v-dem', date: '2023-12-31', dimension: 'liberal_democracy', score: 0.77 },
  { source: 'v-dem', date: '2024-12-31', dimension: 'liberal_democracy', score: 0.74 },

  // V-Dem Rule of Law (USA)
  { source: 'v-dem', date: '2020-12-31', dimension: 'rule_of_law', score: 0.88 },
  { source: 'v-dem', date: '2022-12-31', dimension: 'rule_of_law', score: 0.85 },
  { source: 'v-dem', date: '2024-12-31', dimension: 'rule_of_law', score: 0.81 },

  // Freedom House — Freedom in the World (USA, normalized to 0-1)
  {
    source: 'freedom-house',
    date: '2020-12-31',
    dimension: 'civil_liberties',
    score: 0.86,
    rawScore: 86,
    notes: 'FH FitW 2020 aggregate',
  },
  {
    source: 'freedom-house',
    date: '2021-12-31',
    dimension: 'civil_liberties',
    score: 0.83,
    rawScore: 83,
    notes: 'FH FitW 2021 aggregate',
  },
  {
    source: 'freedom-house',
    date: '2022-12-31',
    dimension: 'civil_liberties',
    score: 0.83,
    rawScore: 83,
    notes: 'FH FitW 2022 aggregate',
  },
  {
    source: 'freedom-house',
    date: '2023-12-31',
    dimension: 'civil_liberties',
    score: 0.84,
    rawScore: 84,
    notes: 'FH FitW 2023 aggregate',
  },
  {
    source: 'freedom-house',
    date: '2024-12-31',
    dimension: 'civil_liberties',
    score: 0.82,
    rawScore: 82,
    notes: 'FH FitW 2024 aggregate',
  },

  // Freedom House — media freedom dimension
  {
    source: 'freedom-house',
    date: '2023-12-31',
    dimension: 'media_freedom',
    score: 0.75,
    rawScore: 30,
    notes: 'FH press freedom sub-score (out of 40)',
  },
  {
    source: 'freedom-house',
    date: '2024-12-31',
    dimension: 'media_freedom',
    score: 0.73,
    rawScore: 29,
    notes: 'FH press freedom sub-score (out of 40)',
  },

  // Bright Line Watch — expert survey (quarterly, representative samples)
  {
    source: 'bright-line-watch',
    date: '2020-06-30',
    dimension: 'liberal_democracy',
    score: 0.73,
    notes: 'BLW Wave 12 expert survey',
  },
  {
    source: 'bright-line-watch',
    date: '2021-06-30',
    dimension: 'liberal_democracy',
    score: 0.75,
    notes: 'BLW Wave 16 expert survey',
  },
  {
    source: 'bright-line-watch',
    date: '2022-06-30',
    dimension: 'liberal_democracy',
    score: 0.72,
    notes: 'BLW Wave 20 expert survey',
  },
  {
    source: 'bright-line-watch',
    date: '2023-06-30',
    dimension: 'liberal_democracy',
    score: 0.71,
    notes: 'BLW Wave 24 expert survey',
  },
  {
    source: 'bright-line-watch',
    date: '2024-06-30',
    dimension: 'liberal_democracy',
    score: 0.68,
    notes: 'BLW Wave 28 expert survey',
  },

  // Bright Line Watch — government accountability
  {
    source: 'bright-line-watch',
    date: '2023-06-30',
    dimension: 'government_accountability',
    score: 0.65,
    notes: 'BLW accountability sub-dimension',
  },
  {
    source: 'bright-line-watch',
    date: '2024-06-30',
    dimension: 'government_accountability',
    score: 0.6,
    notes: 'BLW accountability sub-dimension',
  },

  // Bright Line Watch — executive constraints
  {
    source: 'bright-line-watch',
    date: '2023-06-30',
    dimension: 'executive_constraints',
    score: 0.7,
    notes: 'BLW executive constraints sub-dimension',
  },
  {
    source: 'bright-line-watch',
    date: '2024-06-30',
    dimension: 'executive_constraints',
    score: 0.64,
    notes: 'BLW executive constraints sub-dimension',
  },
];

/**
 * Seed validation data into the database. Uses ON CONFLICT DO NOTHING
 * to avoid duplicates on re-run.
 */
export async function seedValidationData(): Promise<number> {
  if (!isDbAvailable()) return 0;

  const db = getDb();
  let inserted = 0;

  for (const point of SEED_VALIDATION_DATA) {
    const result = await db
      .insert(validationDataPoints)
      .values({
        source: point.source,
        date: point.date,
        dimension: point.dimension,
        score: point.score,
        rawScore: point.rawScore,
        notes: point.notes,
      })
      .onConflictDoNothing();

    if (result.rowCount && result.rowCount > 0) {
      inserted++;
    }
  }

  return inserted;
}
