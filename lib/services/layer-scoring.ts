import { and, eq } from 'drizzle-orm';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { getDb, isDbAvailable } from '@/lib/db';
import { aiDocumentAssessments } from '@/lib/db/schema';
import { PRIMARY_BASELINE_ID } from '@/lib/methodology/scoring-config';
import {
  computeBaselineStructuralDistribution,
  extractWeekMetadata,
} from '@/lib/services/baseline-distributions';
import { synthesizeConvergence } from '@/lib/services/convergence-synthesis';
import type { Pass1Result, Pass2Result } from '@/lib/services/layer2-assessment-service';
import { computeAIAssessmentSummary } from '@/lib/services/layer2-assessment-service';
import { getBaselineAIFlagRate } from '@/lib/services/layer2-store';
import { computeRollingThematicDrift } from '@/lib/services/semantic-drift-service';
import { computeStructuralScore } from '@/lib/services/structural-anomaly-service';
import type { WeeklyAggregate } from '@/lib/services/weekly-aggregator';
import type { AIAssessmentSummary, StructuralScore } from '@/lib/types/structural';

/**
 * Compute Layer 1 (structural anomaly) score for a category-week.
 * Returns null if metadata or baseline is unavailable.
 */
export async function computeStructuralLayer(
  category: string,
  weekOf: string,
): Promise<StructuralScore | null> {
  const weekMetadata = await extractWeekMetadata(category, weekOf);
  if (!weekMetadata) return null;

  const primaryConfig = BASELINE_CONFIGS.find((c) => c.id === PRIMARY_BASELINE_ID);
  if (!primaryConfig) return null;

  const baselineDistribution = await computeBaselineStructuralDistribution(primaryConfig, category);
  if (!baselineDistribution) return null;

  return computeStructuralScore(weekMetadata, baselineDistribution);
}

/**
 * Enrich a weekly aggregate with Layer 1 (structural), Layer 2 (AI), and Layer 3 (thematic) scores,
 * plus the convergence synthesis.
 */
export async function enrichWithLayerScores(
  agg: WeeklyAggregate,
  aiSummary?: AIAssessmentSummary | null,
): Promise<WeeklyAggregate> {
  try {
    const [structural, thematic] = await Promise.all([
      computeStructuralLayer(agg.category, agg.weekOf),
      computeRollingThematicDrift(agg.category, agg.weekOf),
    ]);

    const convergence = synthesizeConvergence(structural, aiSummary ?? null, thematic);

    return {
      ...agg,
      structuralScore: structural?.composite ?? undefined,
      structuralDetail: structural ?? undefined,
      thematicScore: thematic?.zScore ?? undefined,
      thematicDetail: thematic ?? undefined,
      convergenceScore: convergence.layersElevated,
      convergenceDetail: convergence,
      aiScore: aiSummary?.flagRateZScore ?? undefined,
      aiDetail: aiSummary ?? undefined,
    };
  } catch (err) {
    console.warn(`[layer-scoring] Failed for ${agg.category}/${agg.weekOf}:`, err);
    return agg;
  }
}

const STUB_META = { model: '', provider: '', tokensInput: 0, tokensOutput: 0, latencyMs: 0 };

function toPass1Results(
  rows: Array<{
    url: string;
    relevant: boolean | null;
    confidence: number | null;
    erosionType: string | null;
    signals: string[] | null;
    model: string;
  }>,
): Pass1Result[] {
  return rows.map((r) => ({
    url: r.url,
    response: {
      relevant: r.relevant ?? false,
      confidence: r.confidence ?? 0,
      erosionType: (r.erosionType ?? 'routine') as 'routine',
      signals: (r.signals as string[]) ?? [],
    },
    meta: { ...STUB_META, model: r.model },
  }));
}

function toPass2Results(
  rows: Array<{
    url: string;
    assessment: string | null;
    confidence: number | null;
    erosionType: string | null;
    reasoning: string | null;
    comparativeContext: string | null;
    citedPassages: string[] | null;
    counterArguments: string[] | null;
    isAuditSample: boolean;
    model: string;
  }>,
): Pass2Result[] {
  return rows.map((r) => ({
    url: r.url,
    response: {
      assessment: (r.assessment ?? 'routine') as 'routine',
      confidence: r.confidence ?? 0,
      erosionType: (r.erosionType ?? 'routine') as 'routine',
      reasoning: r.reasoning ?? '',
      comparativeContext: r.comparativeContext ?? '',
      citedPassages: (r.citedPassages as string[]) ?? [],
      counterArguments: (r.counterArguments as string[]) ?? [],
    },
    isAuditSample: r.isAuditSample,
    meta: { ...STUB_META, model: r.model },
  }));
}

async function fetchPassRows(category: string, weekOf: string, pass: number) {
  const db = getDb();
  if (pass === 1) {
    return db
      .select({
        url: aiDocumentAssessments.url,
        relevant: aiDocumentAssessments.relevant,
        confidence: aiDocumentAssessments.confidence,
        erosionType: aiDocumentAssessments.erosionType,
        signals: aiDocumentAssessments.signals,
        model: aiDocumentAssessments.model,
      })
      .from(aiDocumentAssessments)
      .where(
        and(
          eq(aiDocumentAssessments.category, category),
          eq(aiDocumentAssessments.weekOf, weekOf),
          eq(aiDocumentAssessments.pass, 1),
        ),
      );
  }
  return db
    .select({
      url: aiDocumentAssessments.url,
      assessment: aiDocumentAssessments.assessment,
      confidence: aiDocumentAssessments.confidence,
      erosionType: aiDocumentAssessments.erosionType,
      reasoning: aiDocumentAssessments.reasoning,
      comparativeContext: aiDocumentAssessments.comparativeContext,
      citedPassages: aiDocumentAssessments.citedPassages,
      counterArguments: aiDocumentAssessments.counterArguments,
      isAuditSample: aiDocumentAssessments.isAuditSample,
      model: aiDocumentAssessments.model,
    })
    .from(aiDocumentAssessments)
    .where(
      and(
        eq(aiDocumentAssessments.category, category),
        eq(aiDocumentAssessments.weekOf, weekOf),
        eq(aiDocumentAssessments.pass, 2),
      ),
    );
}

/**
 * Build an AI assessment summary from stored ai_document_assessments for a category-week.
 * Used by recompute-layer-scores to reconstruct summaries without re-running AI.
 */
export async function loadStoredAISummary(
  category: string,
  weekOf: string,
): Promise<AIAssessmentSummary | null> {
  if (!isDbAvailable()) return null;

  const pass1Rows = await fetchPassRows(category, weekOf, 1);
  if (pass1Rows.length === 0) return null;

  const pass2Rows = await fetchPassRows(category, weekOf, 2);
  const baseline = await getBaselineAIFlagRate(category, 'biden_2022');

  return computeAIAssessmentSummary(
    toPass1Results(pass1Rows as Parameters<typeof toPass1Results>[0]),
    toPass2Results(pass2Rows as Parameters<typeof toPass2Results>[0]),
    baseline?.rate ?? 0,
    baseline?.stdDev ?? 0.05,
    pass1Rows[0]?.model ?? 'unknown',
    (pass2Rows[0] as { model?: string })?.model ?? 'unknown',
  );
}
