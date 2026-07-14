import { and, eq, sql } from 'drizzle-orm';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { getDb, isDbAvailable } from '@/lib/db';
import { retrievalRelevantOnly } from '@/lib/db/document-filters';
import { documents } from '@/lib/db/schema';
import {
  BOOTSTRAP_CONFIDENCE,
  SEMANTIC_DRIFT_ANOMALY_THRESHOLD,
  SEMANTIC_DRIFT_ELEVATED_THRESHOLD,
  THEMATIC_ROLLING_WINDOW_WEEKS,
} from '@/lib/methodology/scoring-config';
import { getBaseline } from '@/lib/services/baseline-service';
import { computeCentroid, cosineSimilarity } from '@/lib/services/embedding-service';
import type { ThematicDriftScore } from '@/lib/types/structural';
import { toDateString } from '@/lib/utils/date-utils';
import { mean, roundTo, stddev } from '@/lib/utils/math';

export interface SemanticDriftResult {
  category: string;
  weekOf: string;
  baselineId: string;
  rawCosineDrift: number;
  noiseFloor: number | null;
  normalizedDrift: number | null;
  interpretation: string;
}

/**
 * Compute the centroid of all embedded documents for a given category and week.
 * Returns null if no embeddings are available for that week.
 */
export async function computeWeekCentroid(
  category: string,
  weekOf: string,
): Promise<number[] | null> {
  if (!isDbAvailable()) return null;

  const db = getDb();

  const rows = await db
    .select({ embedding: documents.embedding })
    .from(documents)
    .where(
      and(
        eq(documents.category, category),
        sql`date_trunc('week', ${documents.publishedAt}) = date_trunc('week', ${weekOf}::date)`,
        sql`${documents.embedding} IS NOT NULL`,
        retrievalRelevantOnly(),
      ),
    );

  if (rows.length === 0) return null;

  return computeCentroid(rows.map((r) => r.embedding!));
}

/**
 * Compute semantic drift between a week's centroid and a baseline centroid.
 * Returns null if embeddings are not available for either side.
 */
export async function computeSemanticDrift(
  category: string,
  weekOf: string,
  baselineId?: string,
): Promise<SemanticDriftResult | null> {
  const effectiveBaselineId = baselineId ?? BASELINE_CONFIGS[0].id;

  const weekCentroid = await computeWeekCentroid(category, weekOf);
  if (!weekCentroid) return null;

  const baseline = await getBaseline(effectiveBaselineId, category);
  if (!baseline?.embeddingCentroid) return null;

  const similarity = cosineSimilarity(weekCentroid, baseline.embeddingCentroid);
  const rawCosineDrift = 1 - similarity;
  const noiseFloor = baseline.driftNoiseFloor;

  let normalizedDrift: number | null = null;
  let interpretation: string;

  if (noiseFloor && noiseFloor > 0) {
    normalizedDrift = rawCosineDrift / noiseFloor;
    const rounded = roundTo(normalizedDrift, 1);

    if (normalizedDrift >= SEMANTIC_DRIFT_ANOMALY_THRESHOLD) {
      interpretation = `This week's language shift is ${rounded}x normal variation for this category (anomalous)`;
    } else if (normalizedDrift >= SEMANTIC_DRIFT_ELEVATED_THRESHOLD) {
      interpretation = `This week's language shift is ${rounded}x normal variation for this category (elevated)`;
    } else {
      interpretation = `This week's language shift is ${rounded}x normal variation for this category (within normal range)`;
    }
  } else {
    interpretation =
      'Noise floor not available — raw drift measured but cannot assess relative significance';
  }

  return {
    category,
    weekOf,
    baselineId: effectiveBaselineId,
    rawCosineDrift,
    noiseFloor,
    normalizedDrift,
    interpretation,
  };
}

/**
 * Get ordered week-start dates going backward from a given week.
 * Returns ISO date strings for the Monday of each preceding week.
 */
function getPrecedingWeeks(weekOf: string, count: number): string[] {
  const weeks: string[] = [];
  const d = new Date(weekOf);
  for (let i = 1; i <= count; i++) {
    const prev = new Date(d);
    prev.setDate(prev.getDate() - 7 * i);
    weeks.push(toDateString(prev));
  }
  return weeks.reverse();
}

/**
 * Compute rolling intra-administration thematic drift.
 * Uses a rolling window of the current administration's week centroids,
 * then measures how far the current week deviates from the rolling mean.
 * During bootstrap (insufficient rolling data), uses cross-admin comparison at reduced weight.
 */
export async function computeRollingThematicDrift(
  category: string,
  weekOf: string,
  options?: { windowSize?: number; baselineId?: string },
): Promise<ThematicDriftScore | null> {
  const windowSize = options?.windowSize ?? THEMATIC_ROLLING_WINDOW_WEEKS;
  const baselineId = options?.baselineId ?? BASELINE_CONFIGS[0].id;

  const currentCentroid = await computeWeekCentroid(category, weekOf);
  if (!currentCentroid) return null;

  const precedingWeeks = getPrecedingWeeks(weekOf, windowSize);
  const rollingCentroids: number[][] = [];

  for (const w of precedingWeeks) {
    const c = await computeWeekCentroid(category, w);
    if (c) rollingCentroids.push(c);
  }

  const isBootstrap = rollingCentroids.length < windowSize / 2;

  // Cross-admin distance (always computed for context)
  let crossAdminDistance: number | null = null;
  const baseline = await getBaseline(baselineId, category);
  if (baseline?.embeddingCentroid) {
    crossAdminDistance = 1 - cosineSimilarity(currentCentroid, baseline.embeddingCentroid);
  }

  if (rollingCentroids.length === 0) {
    return buildBootstrapResult(crossAdminDistance, baselineId, windowSize);
  }

  return buildRollingResult(
    currentCentroid,
    rollingCentroids,
    crossAdminDistance,
    baselineId,
    windowSize,
    isBootstrap,
  );
}

function buildBootstrapResult(
  crossAdminDistance: number | null,
  baselineId: string,
  windowSize: number,
): ThematicDriftScore {
  return {
    rollingCentroidDistance: crossAdminDistance ?? 0,
    rollingWindow: { weeks: 0, meanDistance: 0, stdDev: 0 },
    zScore: 0,
    novelDocumentRate: 0,
    varianceRatio: 1,
    crossAdminDistance,
    crossAdminBaseline: baselineId,
    bootstrap: true,
  };
}

function buildRollingResult(
  currentCentroid: number[],
  rollingCentroids: number[][],
  crossAdminDistance: number | null,
  baselineId: string,
  windowSize: number,
  isBootstrap: boolean,
): ThematicDriftScore {
  const rollingMeanCentroid = computeCentroid(rollingCentroids);
  const distanceFromRolling = rollingMeanCentroid
    ? 1 - cosineSimilarity(currentCentroid, rollingMeanCentroid)
    : 0;

  // Compute inter-week distances within the rolling window for mean/stddev
  const interWeekDistances: number[] = [];
  for (let i = 1; i < rollingCentroids.length; i++) {
    interWeekDistances.push(1 - cosineSimilarity(rollingCentroids[i - 1], rollingCentroids[i]));
  }

  const meanDist = mean(interWeekDistances);
  const stdDist = stddev(interWeekDistances);
  const z = stdDist > 0 ? (distanceFromRolling - meanDist) / stdDist : 0;

  return {
    rollingCentroidDistance: distanceFromRolling,
    rollingWindow: { weeks: rollingCentroids.length, meanDistance: meanDist, stdDev: stdDist },
    zScore: isBootstrap ? z * BOOTSTRAP_CONFIDENCE : z,
    novelDocumentRate: 0,
    varianceRatio: 1,
    crossAdminDistance,
    crossAdminBaseline: baselineId,
    bootstrap: isBootstrap,
  };
}

/**
 * Detect documents that are far from the rolling centroid (novel/outlier docs).
 * Pure function operating on pre-fetched embeddings.
 */
export function detectNovelDocuments(
  embeddings: number[][],
  rollingCentroid: number[],
  threshold: number = 0.3,
): { novelRate: number; novelIndices: number[] } {
  if (embeddings.length === 0) return { novelRate: 0, novelIndices: [] };

  const novelIndices: number[] = [];
  for (let i = 0; i < embeddings.length; i++) {
    const distance = 1 - cosineSimilarity(embeddings[i], rollingCentroid);
    if (distance > threshold) novelIndices.push(i);
  }

  return {
    novelRate: novelIndices.length / embeddings.length,
    novelIndices,
  };
}

/**
 * Compute the ratio of embedding variance between current week and rolling window.
 * Values >1 indicate increased topic diversity; <1 indicate narrowing focus.
 * Pure function.
 */
export function computeVarianceRatio(
  currentEmbeddings: number[][],
  currentCentroid: number[],
  rollingEmbeddings: number[][],
  rollingCentroid: number[],
): number {
  const currentVar = computeEmbeddingVariance(currentEmbeddings, currentCentroid);
  const rollingVar = computeEmbeddingVariance(rollingEmbeddings, rollingCentroid);
  if (rollingVar === 0) return 1;
  return currentVar / rollingVar;
}

function computeEmbeddingVariance(embeddings: number[][], centroid: number[]): number {
  if (embeddings.length === 0) return 0;
  const distances = embeddings.map((e) => 1 - cosineSimilarity(e, centroid));
  return mean(distances.map((d) => d * d));
}
