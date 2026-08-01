/**
 * Data validation service — "What's the processing backlog, and do we have
 * enough reference data?" (the Data Readiness report).
 *
 * Checks stage completeness (scores, embeddings), baseline completeness, Layer 2
 * assessment coverage, and layer score population. Each finding is tagged
 * `action` (a remediable backlog item) or `limitation` (a documented fact no
 * command fixes — e.g. baseline gaps, audit-recall rates), mirroring Ingest
 * Health (#649). Derivation correctness lives in the Derivation Graph; metadata
 * classification lives in Ingest Health.
 *
 * Layer 2 / layer score queries: data-validation-queries.ts
 */

import { eq, sql, isNull, and } from 'drizzle-orm';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents, documentScores, weeklyAggregates, baselines } from '@/lib/db/schema';
import {
  getLayer2Completeness,
  getLayerScorePopulation,
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

export interface NarrativeCoverage {
  elevatedWeeks: number;
  narrativeWeeks: number;
  missingWeeks: number;
  /**
   * Of missingWeeks, how many are baseline periods (before 2025-01-20). Baseline
   * narratives are not shown to users (pending product decision #651), so these
   * are a known limitation, not an actionable backlog (#649 follow-up).
   */
  missingWeeksBaseline: number;
  /** Weeks that have at least one elevated category-week narrative. */
  weeksWithNarratives: number;
  /** Weeks that have a weekly summary (_overview). */
  weeksWithSummary: number;
  /** Living term summary exists and reflects the latest aggregate data. */
  termSummaryFresh: boolean;
  /** Weeks missing a weekly summary despite having category narratives. */
  missingSummaryWeeks: number;
}

/**
 * A Data Readiness finding tagged by severity (#649, mirrors IngestWarning):
 * `action` has a remediation worth running; `limitation` is a documented fact
 * no command fixes (baseline-period gaps, audit-recall rates, steady-state
 * layer-coverage) — a known issue, not a call to act.
 */
export interface DataWarning {
  severity: 'action' | 'limitation';
  text: string;
}

export interface DataReport {
  stageCompleteness: StageCompleteness;
  baselineCompleteness: BaselineCompleteness[];
  layer2Completeness: Layer2Completeness;
  layerScorePopulation: LayerScorePeriodStats[];
  narrativeCoverage: NarrativeCoverage;
  warnings: string[];
  /** Same findings tagged action/limitation for the known-issues split (#649). */
  warningDetails: DataWarning[];
}

// Re-export query functions for consumers
export { getLayer2Completeness, getLayerScorePopulation, getNarrativeCoverage };

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
      missingEmbeddings: sql<number>`count(*) filter (where ${documents.embeddedAt} is null and ${documents.contentType} != 'metadata_only' and ${documents.retrievalRelevant} is not false and ${documents.countingScope} is not false and ${documents.category} != 'intent')::int`,
      missingEmbeddingsIntent: sql<number>`count(*) filter (where ${documents.embeddedAt} is null and ${documents.contentType} != 'metadata_only' and ${documents.retrievalRelevant} is not false and ${documents.countingScope} is not false and ${documents.category} = 'intent')::int`,
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
        // Mirror the scorer's eligibility (#566 / validate:graph G1a): the
        // floor and retrieval filter keep permanently-ineligible docs from
        // reporting as "missing scores" forever.
        sql`${documents.contentType} != 'metadata_only'`,
        sql`length(coalesce(${documents.content}, '')) >= 100`,
        sql`${documents.retrievalRelevant} is not false`,
        sql`${documents.countingScope} is not false`,
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

function checkNarrativeCoverage(nc: NarrativeCoverage): DataWarning[] {
  const warnings: DataWarning[] = [];
  // Only CURRENT-TERM missing narratives are actionable. Baseline-period
  // narratives are not shown to users (pending product decision #651), so
  // reporting them as "needs attention" is wrong — they are a known limitation.
  const currentMissing = nc.missingWeeks - nc.missingWeeksBaseline;
  if (currentMissing > 0) {
    warnings.push({
      severity: 'action',
      text: `${currentMissing} elevated current-term category-weeks missing narratives (run: pnpm scores:enrich --narratives)`,
    });
  }
  if (nc.missingWeeksBaseline > 0) {
    warnings.push({
      severity: 'limitation',
      text: `${nc.missingWeeksBaseline} elevated baseline category-weeks have no narrative — baseline narratives are not shown to users pending a product decision (#651)`,
    });
  }
  if (nc.missingSummaryWeeks > 0) {
    warnings.push({
      severity: 'action',
      text: `${nc.missingSummaryWeeks} narrated weeks missing weekly summaries (run: pnpm scores:enrich --narratives)`,
    });
  }
  // Narrative *staleness* is owned by the Derivation Graph (G4/G4h): measured
  // against the newest assessment (`assessed_at`) and acceptance-aware. Data
  // Readiness's old computed_at check was a phantom (741 vs 0), removed in #647.
  return warnings;
}

// Baseline periods (before the current term): gaps here are documented facts we
// deliberately don't backfill (calibrated reference; baseline writes need
// approval), so they classify as `limitation` rather than `action` (#649).
const BASELINE_PERIODS = new Set([
  'trump_2017',
  'trump_2018',
  'trump_2019',
  'trump_2020',
  'biden_2021',
  'biden_2022',
  'biden_2023',
  'biden_2024',
]);

function periodSeverity(period: string): DataWarning['severity'] {
  return BASELINE_PERIODS.has(period) ? 'limitation' : 'action';
}

export function collectWarningDetails(report: DataReport): DataWarning[] {
  const warnings: DataWarning[] = [];
  const push = (severity: DataWarning['severity'], text: string) =>
    warnings.push({ severity, text });
  const s = report.stageCompleteness;

  // Processing backlog — remediable work.
  if (s.missingScores > 0) {
    push('action', `${s.missingScores} documents need scores (run: pnpm scores:recompute)`);
  }
  if (s.missingEmbeddings > 0) {
    push(
      'action',
      `${s.missingEmbeddings} detection documents need embedding (run: pnpm embeddings:backfill)`,
    );
  }
  // Aggregate presence is owned by the Derivation Graph (G2a) as of #647; the
  // stage-completeness table still shows the count as backlog, but the concern
  // (a scored week lacking its aggregate) is the Graph's invariant, not a DR warning.

  for (const t of checkBaselineCompleteness(report.baselineCompleteness)) push('action', t);

  for (const p of report.layer2Completeness) {
    // L2 gaps: actionable in the current term, an accepted limitation in baselines.
    const sev = periodSeverity(p.period);
    if (p.missingPass1 > 0) push(sev, `${p.period}: ${p.missingPass1} docs missing L2 Pass 1`);
    if (p.missingPass2 > 0)
      push(sev, `${p.period}: ${p.missingPass2} flagged docs missing L2 Pass 2`);
    // Audit false-negative rate is a recall metric no command clears — a limitation.
    if (p.auditFalseNegatives > 0) {
      const rate = ((p.auditFalseNegatives / p.auditSampled) * 100).toFixed(1);
      push(
        'limitation',
        `${p.period}: ${p.auditFalseNegatives}/${p.auditSampled} audit false negatives (${rate}%)`,
      );
    }
  }

  for (const p of report.layerScorePopulation) {
    if (p.totalWeeks > 0 && p.withAllLayers === 0) {
      // Zero coverage is a real break, not steady state — actionable.
      push('action', `${p.period}: no weeks have all three layer scores (run: pnpm scores:enrich)`);
    } else if (p.totalWeeks > 0 && p.withAllLayers < p.totalWeeks) {
      // 93–96% is the steady state (zero-doc weeks / weeks lacking a layer) — a limitation.
      const pct = ((p.withAllLayers / p.totalWeeks) * 100).toFixed(0);
      push(
        'limitation',
        `${p.period}: ${p.withAllLayers}/${p.totalWeeks} weeks have all layer scores (${pct}%)`,
      );
    }
  }

  // Metadata-only classification moved to Ingest Health in #648; data-integrity
  // checks moved to the Derivation Graph in #647.

  warnings.push(...checkNarrativeCoverage(report.narrativeCoverage));

  return warnings;
}

export function collectWarnings(report: DataReport): string[] {
  return collectWarningDetails(report).map((w) => w.text);
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runDataValidation(category?: string): Promise<DataReport> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');

  const [stageCompleteness, baselineCompleteness, layer2Completeness, layerScores, narrativeCov] =
    await Promise.all([
      getStageCompleteness(category),
      getBaselineCompleteness(),
      getLayer2Completeness(category),
      getLayerScorePopulation(category),
      getNarrativeCoverage(category),
    ]);

  const report: DataReport = {
    stageCompleteness,
    baselineCompleteness,
    layer2Completeness,
    layerScorePopulation: layerScores,
    narrativeCoverage: narrativeCov,
    warnings: [],
    warningDetails: [],
  };
  report.warningDetails = collectWarningDetails(report);
  report.warnings = report.warningDetails.map((w) => w.text);

  return report;
}
