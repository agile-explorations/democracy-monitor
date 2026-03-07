/**
 * Data validation service — "Is the data ready for analysis?"
 *
 * Checks stage completeness (scores, embeddings, aggregates),
 * baseline completeness, Layer 2 assessment coverage, layer score
 * population in weekly_aggregates, and metadata_only classification.
 *
 * Layer 2 / layer score / metadata queries: data-validation-queries.ts
 */

import { eq, sql, isNull, and } from 'drizzle-orm';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents, documentScores, weeklyAggregates, baselines } from '@/lib/db/schema';
import { getDataIntegrityChecks } from './data-integrity-queries';
import {
  getLayer2Completeness,
  getLayerScorePopulation,
  getMetadataOnlyClassification,
  getNarrativeCoverage,
} from './data-validation-queries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface StageCompleteness {
  totalDocuments: number;
  missingScores: number;
  missingEmbeddings: number;
  missingEmbeddingsIntent: number;
  metadataOnlyCount: number;
  totalWeeks: number;
  missingAggregates: number;
}

export interface BaselineCompleteness {
  baselineId: string;
  category: string;
  hasStats: boolean;
}

export interface Layer2PeriodStats {
  period: string;
  label: string;
  totalDocuments: number;
  pass1Assessed: number;
  missingPass1: number;
  pass1Flagged: number;
  pass2Assessed: number;
  missingPass2: number;
  pass2Flagged: number;
  auditSampled: number;
  auditFalseNegatives: number;
}

export type Layer2Completeness = Layer2PeriodStats[];

export interface LayerScorePeriodStats {
  period: string;
  label: string;
  totalWeeks: number;
  withStructural: number;
  withAi: number;
  withThematic: number;
  withConvergence: number;
  withAllLayers: number;
}

export interface MetadataOnlyStats {
  population: string;
  sourceFilter: { column: string; value: string };
  total: number;
  markedMetadataOnly: number;
  unmarked: number;
  pass: boolean;
}

export interface DataIntegrityCheck {
  name: string;
  count: number;
  detail?: string;
  pass: boolean;
}

export interface NarrativeCoverage {
  elevatedWeeks: number;
  narrativeWeeks: number;
  missingWeeks: number;
  staleWeeks: number;
}

export interface DataReport {
  stageCompleteness: StageCompleteness;
  baselineCompleteness: BaselineCompleteness[];
  layer2Completeness: Layer2Completeness;
  layerScorePopulation: LayerScorePeriodStats[];
  metadataOnlyClassification: MetadataOnlyStats[];
  narrativeCoverage: NarrativeCoverage;
  dataIntegrity: DataIntegrityCheck[];
  warnings: string[];
}

// Re-export query functions for consumers
export { getDataIntegrityChecks } from './data-integrity-queries';
export {
  getLayer2Completeness,
  getLayerScorePopulation,
  getMetadataOnlyClassification,
  getNarrativeCoverage,
};

// ---------------------------------------------------------------------------
// Stage completeness queries
// ---------------------------------------------------------------------------

const EMPTY_STAGE: StageCompleteness = {
  totalDocuments: 0,
  missingScores: 0,
  missingEmbeddings: 0,
  missingEmbeddingsIntent: 0,
  metadataOnlyCount: 0,
  totalWeeks: 0,
  missingAggregates: 0,
};

async function getAggregateGap(
  db: ReturnType<typeof getDb>,
  category?: string,
): Promise<{ totalWeeks: number; missingAggregates: number }> {
  const scoreCatFilter = category ? eq(documentScores.category, category) : undefined;
  const aggCatFilter = category ? eq(weeklyAggregates.category, category) : undefined;

  const [weekStats] = await db
    .select({
      totalWeeks: sql<number>`count(distinct (${documentScores.category}, ${documentScores.weekOf}))::int`,
    })
    .from(documentScores)
    .where(scoreCatFilter);

  const [aggStats] = await db
    .select({ aggWeeks: sql<number>`count(*)::int` })
    .from(weeklyAggregates)
    .where(aggCatFilter);

  const totalWeeks = Number(weekStats.totalWeeks);
  return {
    totalWeeks,
    missingAggregates: Math.max(0, totalWeeks - Number(aggStats.aggWeeks)),
  };
}

export async function getStageCompleteness(category?: string): Promise<StageCompleteness> {
  if (!isDbAvailable()) return EMPTY_STAGE;
  const db = getDb();
  const catFilter = category ? eq(documents.category, category) : undefined;

  const [docStats] = await db
    .select({
      total: sql<number>`count(*)::int`,
      missingEmbeddings: sql<number>`count(*) filter (where ${documents.embeddedAt} is null and ${documents.contentType} != 'metadata_only' and ${documents.category} != 'intent')::int`,
      missingEmbeddingsIntent: sql<number>`count(*) filter (where ${documents.embeddedAt} is null and ${documents.contentType} != 'metadata_only' and ${documents.category} = 'intent')::int`,
      metadataOnlyCount: sql<number>`count(*) filter (where ${documents.contentType} = 'metadata_only')::int`,
    })
    .from(documents)
    .where(catFilter);

  const [scoreStats] = await db
    .select({ missingScores: sql<number>`count(*)::int` })
    .from(documents)
    .leftJoin(
      documentScores,
      and(eq(documents.url, documentScores.url), eq(documents.category, documentScores.category)),
    )
    .where(
      and(
        sql`${documents.contentType} != 'metadata_only'`,
        isNull(documentScores.id),
        ...(catFilter ? [catFilter] : []),
      ),
    );

  const aggGap = await getAggregateGap(db, category);

  return {
    totalDocuments: Number(docStats.total),
    missingScores: Number(scoreStats.missingScores),
    missingEmbeddings: Number(docStats.missingEmbeddings),
    missingEmbeddingsIntent: Number(docStats.missingEmbeddingsIntent),
    metadataOnlyCount: Number(docStats.metadataOnlyCount),
    ...aggGap,
  };
}

export async function getBaselineCompleteness(): Promise<BaselineCompleteness[]> {
  if (!isDbAvailable()) return [];
  const rows = await getDb()
    .select({
      baselineId: baselines.baselineId,
      category: baselines.category,
    })
    .from(baselines)
    .orderBy(baselines.baselineId, baselines.category);

  return rows.map((r) => ({
    baselineId: r.baselineId,
    category: r.category,
    hasStats: true,
  }));
}

// ---------------------------------------------------------------------------
// Warning collection
// ---------------------------------------------------------------------------

function checkBaselineCompleteness(baselines: BaselineCompleteness[]): string[] {
  const warnings: string[] = [];
  const categoryKeys = new Set(CATEGORIES.map((c) => c.key));
  const baselinesByConfig = new Map<string, string[]>();
  for (const b of baselines) {
    if (!categoryKeys.has(b.category)) continue;
    if (!baselinesByConfig.has(b.baselineId)) baselinesByConfig.set(b.baselineId, []);
    baselinesByConfig.get(b.baselineId)!.push(b.category);
  }
  for (const config of BASELINE_CONFIGS) {
    const bCats = baselinesByConfig.get(config.id) || [];
    if (bCats.length < CATEGORIES.length) {
      const missing = CATEGORIES.length - bCats.length;
      warnings.push(`${config.id} missing ${missing} baseline(s) (run: pnpm baselines:compute)`);
    }
  }
  return warnings;
}

function checkNarrativeCoverage(nc: NarrativeCoverage): string[] {
  const warnings: string[] = [];
  if (nc.missingWeeks > 0) {
    warnings.push(
      `${nc.missingWeeks} elevated category-weeks missing narratives (run: pnpm layers:enrich --narratives)`,
    );
  }
  if (nc.staleWeeks > 0) {
    warnings.push(
      `${nc.staleWeeks} narratives are stale (generated before latest layer recomputation)`,
    );
  }
  return warnings;
}

export function collectWarnings(report: DataReport): string[] {
  const warnings: string[] = [];
  const s = report.stageCompleteness;

  if (s.missingScores > 0) {
    warnings.push(`${s.missingScores} documents need scores (run: pnpm scores:recompute)`);
  }
  if (s.missingEmbeddings > 0) {
    warnings.push(
      `${s.missingEmbeddings} detection documents need embedding (run: pnpm embeddings:backfill)`,
    );
  }
  if (s.missingAggregates > 0) {
    warnings.push(`${s.missingAggregates} weeks need aggregates (run: pnpm backfill)`);
  }

  warnings.push(...checkBaselineCompleteness(report.baselineCompleteness));

  for (const p of report.layer2Completeness) {
    if (p.missingPass1 > 0) warnings.push(`${p.period}: ${p.missingPass1} docs missing L2 Pass 1`);
    if (p.missingPass2 > 0)
      warnings.push(`${p.period}: ${p.missingPass2} flagged docs missing L2 Pass 2`);
    if (p.auditFalseNegatives > 0) {
      const rate = ((p.auditFalseNegatives / p.auditSampled) * 100).toFixed(1);
      warnings.push(
        `${p.period}: ${p.auditFalseNegatives}/${p.auditSampled} audit false negatives (${rate}%)`,
      );
    }
  }

  for (const p of report.layerScorePopulation) {
    if (p.totalWeeks > 0 && p.withAllLayers === 0) {
      warnings.push(`${p.period}: no weeks have all three layer scores (run: pnpm layers:enrich)`);
    } else if (p.totalWeeks > 0 && p.withAllLayers < p.totalWeeks) {
      const pct = ((p.withAllLayers / p.totalWeeks) * 100).toFixed(0);
      warnings.push(
        `${p.period}: ${p.withAllLayers}/${p.totalWeeks} weeks have all layer scores (${pct}%)`,
      );
    }
  }

  for (const m of report.metadataOnlyClassification) {
    if (!m.pass)
      warnings.push(`${m.population}: ${m.unmarked} of ${m.total} not marked metadata_only`);
  }

  warnings.push(...checkNarrativeCoverage(report.narrativeCoverage));

  for (const check of report.dataIntegrity) {
    if (!check.pass) {
      const detail = check.detail ? `: ${check.detail}` : '';
      warnings.push(`${check.name} (${check.count}${detail})`);
    }
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runDataValidation(category?: string): Promise<DataReport> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');

  const [
    stageCompleteness,
    baselineCompleteness,
    layer2Completeness,
    layerScores,
    metadataOnly,
    narrativeCov,
    dataIntegrity,
  ] = await Promise.all([
    getStageCompleteness(category),
    getBaselineCompleteness(),
    getLayer2Completeness(category),
    getLayerScorePopulation(category),
    getMetadataOnlyClassification(),
    getNarrativeCoverage(category),
    getDataIntegrityChecks(),
  ]);

  const report: DataReport = {
    stageCompleteness,
    baselineCompleteness,
    layer2Completeness,
    layerScorePopulation: layerScores,
    metadataOnlyClassification: metadataOnly,
    narrativeCoverage: narrativeCov,
    dataIntegrity,
    warnings: [],
  };
  report.warnings = collectWarnings(report);

  return report;
}
