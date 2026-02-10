import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import { DIMENSION_TO_CATEGORY } from '@/lib/data/validation-dimensions';
import { isDbAvailable, getDb } from '@/lib/db';
import { assessments, validationDataPoints } from '@/lib/db/schema';
import type {
  ValidationComparison,
  ValidationDataPoint,
  ValidationSource,
  ValidationSummary,
} from '@/lib/types/validation';

/** Status-to-score mapping for internal assessments (used for alignment comparison). */
export const STATUS_SCORE: Record<string, number> = {
  Stable: 0.9,
  Warning: 0.7,
  Drift: 0.4,
  Capture: 0.1,
};

/** Threshold for alignment: if |external - internal| <= this, they are aligned. */
export const ALIGNMENT_THRESHOLD = 0.2;

/**
 * Store validation data points (upsert on conflict).
 */
export async function storeValidationDataPoints(points: ValidationDataPoint[]): Promise<void> {
  if (!isDbAvailable() || points.length === 0) return;

  const db = getDb();

  for (const point of points) {
    await db
      .insert(validationDataPoints)
      .values({
        source: point.source,
        date: point.date,
        dimension: point.dimension,
        score: point.score,
        rawScore: point.rawScore,
        notes: point.notes,
      })
      .onConflictDoUpdate({
        target: [
          validationDataPoints.source,
          validationDataPoints.date,
          validationDataPoints.dimension,
        ],
        set: {
          score: sql`EXCLUDED.score`,
          rawScore: sql`EXCLUDED.raw_score`,
          notes: sql`EXCLUDED.notes`,
        },
      });
  }
}

/**
 * Compute alignment between an external score and an internal status.
 */
export function computeAlignment(
  externalScore: number,
  internalStatus: string,
): 'aligned' | 'divergent' {
  const internalScore = STATUS_SCORE[internalStatus] ?? 0.5;
  const diff = Math.abs(externalScore - internalScore);
  return diff <= ALIGNMENT_THRESHOLD ? 'aligned' : 'divergent';
}

/**
 * Build comparisons between external validation points and internal assessments.
 */
export function buildComparisons(
  latestBySourceDim: Map<
    string,
    { source: string; dimension: string; score: number; date: string }
  >,
  latestByCategory: Map<string, { status: string }>,
): ValidationComparison[] {
  const comparisons: ValidationComparison[] = [];

  for (const [, point] of latestBySourceDim) {
    const internalCategory = DIMENSION_TO_CATEGORY[point.dimension];
    if (!internalCategory) continue;

    const internalAssessment = latestByCategory.get(internalCategory);

    if (!internalAssessment) {
      comparisons.push({
        source: point.source as ValidationSource,
        dimension: point.dimension,
        externalScore: point.score,
        internalCategory,
        internalStatus: 'unknown',
        alignment: 'insufficient_data',
        lastUpdated: point.date,
      });
      continue;
    }

    comparisons.push({
      source: point.source as ValidationSource,
      dimension: point.dimension,
      externalScore: point.score,
      internalCategory,
      internalStatus: internalAssessment.status,
      alignment: computeAlignment(point.score, internalAssessment.status),
      lastUpdated: point.date,
    });
  }

  return comparisons;
}

/**
 * Compute overall alignment fraction from a list of comparisons.
 */
export function computeOverallAlignment(comparisons: ValidationComparison[]): number {
  const scoreable = comparisons.filter((c) => c.alignment !== 'insufficient_data');
  const alignedCount = scoreable.filter((c) => c.alignment === 'aligned').length;
  return scoreable.length > 0 ? alignedCount / scoreable.length : 0;
}

/**
 * Get a validation summary comparing external indices with internal assessments.
 */
export async function getValidationSummary(options?: {
  source?: ValidationSource;
}): Promise<ValidationSummary> {
  const empty: ValidationSummary = {
    sources: [],
    comparisons: [],
    overallAlignment: 0,
  };

  if (!isDbAvailable()) return empty;

  const db = getDb();

  const conditions = options?.source ? eq(validationDataPoints.source, options.source) : undefined;

  const allPoints = await db
    .select()
    .from(validationDataPoints)
    .where(conditions)
    .orderBy(desc(validationDataPoints.date));

  // Deduplicate: latest per source+dimension, and aggregate source counts
  const latestBySourceDim = new Map<
    string,
    { source: string; dimension: string; score: number; date: string }
  >();
  const sourceCounts = new Map<string, { count: number; lastUpdated: string }>();

  for (const point of allPoints) {
    const key = `${point.source}:${point.dimension}`;
    if (!latestBySourceDim.has(key)) {
      latestBySourceDim.set(key, point);
    }
    const sc = sourceCounts.get(point.source) || { count: 0, lastUpdated: point.date };
    sc.count++;
    if (point.date > sc.lastUpdated) sc.lastUpdated = point.date;
    sourceCounts.set(point.source, sc);
  }

  // Get latest internal assessments per category
  const latestAssessments = await db
    .select()
    .from(assessments)
    .orderBy(desc(assessments.assessedAt));

  const latestByCategory = new Map<string, { status: string }>();
  for (const a of latestAssessments) {
    if (!latestByCategory.has(a.category)) {
      latestByCategory.set(a.category, a);
    }
  }

  const comparisons = buildComparisons(latestBySourceDim, latestByCategory);
  const overallAlignment = computeOverallAlignment(comparisons);

  const sources = Array.from(sourceCounts.entries()).map(([name, data]) => ({
    name: name as ValidationSource,
    lastUpdated: data.lastUpdated,
    dataPointCount: data.count,
  }));

  return { sources, comparisons, overallAlignment };
}

/**
 * Get time series data for a specific source and dimension.
 */
export async function getValidationTimeSeries(
  source: ValidationSource,
  dimension: string,
  options?: { from?: string; to?: string },
): Promise<ValidationDataPoint[]> {
  if (!isDbAvailable()) return [];

  const db = getDb();
  const conditions = [
    eq(validationDataPoints.source, source),
    eq(validationDataPoints.dimension, dimension),
  ];

  if (options?.from) {
    conditions.push(gte(validationDataPoints.date, options.from));
  }
  if (options?.to) {
    conditions.push(lte(validationDataPoints.date, options.to));
  }

  const rows = await db
    .select()
    .from(validationDataPoints)
    .where(and(...conditions))
    .orderBy(validationDataPoints.date);

  return rows.map((r) => ({
    source: r.source as ValidationSource,
    date: r.date,
    dimension: r.dimension,
    score: r.score,
    rawScore: r.rawScore || undefined,
    notes: r.notes || undefined,
  }));
}
