import { and, eq, gte, lte, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { baselines, documents, weeklyAggregates } from '@/lib/db/schema';
import { cosineSimilarity } from '@/lib/services/embedding-service';

export interface BaselineConfig {
  id: string;
  label: string;
  from: string;
  to: string;
}

export const BASELINE_CONFIGS: BaselineConfig[] = [
  { id: 'biden_2024', label: 'Biden 2024', from: '2024-01-01', to: '2025-01-19' },
  { id: 'biden_2021', label: 'Biden 2021–22', from: '2021-01-20', to: '2022-01-19' },
  { id: 'obama_2013', label: 'Obama 2013–14', from: '2013-01-20', to: '2014-01-19' },
];

export interface CategoryBaseline {
  baselineId: string;
  category: string;
  avgWeeklySeverity: number;
  stddevWeeklySeverity: number;
  avgWeeklyDocCount: number;
  avgSeverityMix: number;
  driftNoiseFloor: number | null;
  embeddingCentroid: number[] | null;
  computedAt: string;
}

/**
 * Compute baseline statistics for all categories within a baseline config's date range.
 */
export async function computeBaseline(config: BaselineConfig): Promise<CategoryBaseline[]> {
  if (!isDbAvailable()) return [];

  const db = getDb();

  // Fetch all weekly aggregates within the baseline period
  const rows = await db
    .select()
    .from(weeklyAggregates)
    .where(and(gte(weeklyAggregates.weekOf, config.from), lte(weeklyAggregates.weekOf, config.to)))
    .orderBy(weeklyAggregates.category, weeklyAggregates.weekOf);

  // Group by category
  const grouped: Record<
    string,
    Array<{ weekOf: string; totalSeverity: number; documentCount: number; severityMix: number }>
  > = {};
  for (const row of rows) {
    if (!grouped[row.category]) grouped[row.category] = [];
    grouped[row.category].push({
      weekOf: row.weekOf,
      totalSeverity: row.totalSeverity,
      documentCount: row.documentCount,
      severityMix: row.severityMix,
    });
  }

  const results: CategoryBaseline[] = [];

  for (const [category, weeks] of Object.entries(grouped)) {
    const severities = weeks.map((w) => w.totalSeverity);
    const docCounts = weeks.map((w) => w.documentCount);
    const mixes = weeks.map((w) => w.severityMix);

    const avgWeeklySeverity = mean(severities);
    const stddevWeeklySeverity = stddev(severities);
    const avgWeeklyDocCount = mean(docCounts);
    const avgSeverityMix = mean(mixes);

    // Compute embedding centroid and noise floor
    const { centroid, noiseFloor } = await computeEmbeddingBaseline(
      db,
      category,
      config.from,
      config.to,
      weeks.map((w) => w.weekOf),
    );

    results.push({
      baselineId: config.id,
      category,
      avgWeeklySeverity,
      stddevWeeklySeverity,
      avgWeeklyDocCount,
      avgSeverityMix,
      driftNoiseFloor: noiseFloor,
      embeddingCentroid: centroid,
      computedAt: new Date().toISOString(),
    });
  }

  return results;
}

/**
 * Compute embedding centroid and noise floor for a category within a date range.
 * Returns null values if no embeddings are available.
 */
async function computeEmbeddingBaseline(
  db: ReturnType<typeof getDb>,
  category: string,
  from: string,
  to: string,
  weekDates: string[],
): Promise<{ centroid: number[] | null; noiseFloor: number | null }> {
  try {
    // Fetch all embedded documents in the baseline period for this category
    const docs = await db
      .select({
        embedding: documents.embedding,
        publishedAt: documents.publishedAt,
      })
      .from(documents)
      .where(
        and(
          eq(documents.category, category),
          gte(documents.publishedAt, new Date(from)),
          lte(documents.publishedAt, new Date(to)),
          sql`${documents.embedding} IS NOT NULL`,
        ),
      );

    if (docs.length === 0) return { centroid: null, noiseFloor: null };

    // Compute overall centroid
    const dim = docs[0].embedding!.length;
    const centroid = new Array(dim).fill(0);
    for (const doc of docs) {
      for (let i = 0; i < dim; i++) {
        centroid[i] += doc.embedding![i];
      }
    }
    for (let i = 0; i < dim; i++) {
      centroid[i] /= docs.length;
    }

    // Compute per-week centroids for noise floor
    const weekCentroids: Array<{ weekOf: string; centroid: number[] }> = [];
    for (const weekOf of weekDates) {
      const weekStart = new Date(weekOf);
      const weekEnd = new Date(weekOf);
      weekEnd.setDate(weekEnd.getDate() + 7);

      const weekDocs = docs.filter((d) => {
        if (!d.publishedAt) return false;
        return d.publishedAt >= weekStart && d.publishedAt < weekEnd;
      });

      if (weekDocs.length === 0) continue;

      const wc = new Array(dim).fill(0);
      for (const doc of weekDocs) {
        for (let i = 0; i < dim; i++) {
          wc[i] += doc.embedding![i];
        }
      }
      for (let i = 0; i < dim; i++) {
        wc[i] /= weekDocs.length;
      }
      weekCentroids.push({ weekOf, centroid: wc });
    }

    // Noise floor: stddev of consecutive-week centroid distances
    if (weekCentroids.length < 2) return { centroid, noiseFloor: null };

    const distances: number[] = [];
    for (let i = 1; i < weekCentroids.length; i++) {
      const dist = 1 - cosineSimilarity(weekCentroids[i - 1].centroid, weekCentroids[i].centroid);
      distances.push(dist);
    }

    const noiseFloor = mean(distances) + stddev(distances);

    return { centroid, noiseFloor };
  } catch {
    return { centroid: null, noiseFloor: null };
  }
}

/**
 * Upsert baseline records into the database.
 */
export async function storeBaseline(baselineResults: CategoryBaseline[]): Promise<void> {
  if (!isDbAvailable() || baselineResults.length === 0) return;

  const db = getDb();

  for (const b of baselineResults) {
    await db
      .insert(baselines)
      .values({
        baselineId: b.baselineId,
        category: b.category,
        avgWeeklySeverity: b.avgWeeklySeverity,
        stddevWeeklySeverity: b.stddevWeeklySeverity,
        avgWeeklyDocCount: b.avgWeeklyDocCount,
        avgSeverityMix: b.avgSeverityMix,
        driftNoiseFloor: b.driftNoiseFloor,
        embeddingCentroid: b.embeddingCentroid,
        computedAt: new Date(b.computedAt),
      })
      .onConflictDoUpdate({
        target: [baselines.baselineId, baselines.category],
        set: {
          avgWeeklySeverity: sql`excluded.avg_weekly_severity`,
          stddevWeeklySeverity: sql`excluded.stddev_weekly_severity`,
          avgWeeklyDocCount: sql`excluded.avg_weekly_doc_count`,
          avgSeverityMix: sql`excluded.avg_severity_mix`,
          driftNoiseFloor: sql`excluded.drift_noise_floor`,
          embeddingCentroid: sql`excluded.embedding_centroid`,
          computedAt: sql`excluded.computed_at`,
        },
      });
  }
}

/**
 * Look up a stored baseline for a given baseline ID and category.
 */
export async function getBaseline(
  baselineId: string,
  category: string,
): Promise<CategoryBaseline | null> {
  if (!isDbAvailable()) return null;

  const db = getDb();

  const [row] = await db
    .select()
    .from(baselines)
    .where(and(eq(baselines.baselineId, baselineId), eq(baselines.category, category)))
    .limit(1);

  if (!row) return null;

  return {
    baselineId: row.baselineId,
    category: row.category,
    avgWeeklySeverity: row.avgWeeklySeverity,
    stddevWeeklySeverity: row.stddevWeeklySeverity,
    avgWeeklyDocCount: row.avgWeeklyDocCount,
    avgSeverityMix: row.avgSeverityMix,
    driftNoiseFloor: row.driftNoiseFloor,
    embeddingCentroid: row.embeddingCentroid,
    computedAt: row.computedAt.toISOString(),
  };
}

/**
 * Look up a baseline config by ID.
 */
export function getBaselineConfig(id: string): BaselineConfig | undefined {
  return BASELINE_CONFIGS.find((c) => c.id === id);
}

// --- Utility functions (exported for direct testing) ---

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

export function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / (values.length - 1);
  return Math.sqrt(variance);
}
