import { and, eq, sql } from 'drizzle-orm';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import {
  SEMANTIC_DRIFT_ANOMALY_THRESHOLD,
  SEMANTIC_DRIFT_ELEVATED_THRESHOLD,
} from '@/lib/methodology/scoring-config';
import { getBaseline } from '@/lib/services/baseline-service';
import { computeCentroid, cosineSimilarity } from '@/lib/services/embedding-service';
import { roundTo } from '@/lib/utils/math';

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
