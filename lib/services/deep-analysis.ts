import type { EnhancedAssessment } from './ai-assessment-service';
import { runDebate } from './debate-service';
import { runLegalAnalysis } from './legal-analysis-service';
import {
  countKeywordsInItems,
  calculateTrends,
  detectAnomalies,
  getBaselineCounts,
  recordTrends,
} from './trend-anomaly-service';

/**
 * Enrich an EnhancedAssessment with deep analysis (debate, legal, trends).
 * Mutates the assessment in place. Debate and legal only run for Drift/Capture.
 * Trend analysis runs for all statuses (cheap, no AI).
 */
export async function enrichWithDeepAnalysis(
  assessment: EnhancedAssessment,
  items: { title?: string }[],
): Promise<void> {
  const evidence = items.map((i) => i.title || '').filter(Boolean);

  if (assessment.status === 'Drift' || assessment.status === 'Capture') {
    const [debateResult, legalResult, trendResult] = await Promise.allSettled([
      runDebate(assessment.category, assessment.status, evidence),
      runLegalAnalysis(assessment.category, assessment.status, evidence),
      runTrendAnalysis(assessment.category, items),
    ]);

    if (debateResult.status === 'fulfilled' && debateResult.value) {
      assessment.debate = debateResult.value;
    }
    if (legalResult.status === 'fulfilled' && legalResult.value) {
      assessment.legalAnalysis = legalResult.value;
    }
    if (trendResult.status === 'fulfilled') {
      assessment.trendAnomalies = trendResult.value;
    }
  } else {
    try {
      assessment.trendAnomalies = await runTrendAnalysis(assessment.category, items);
    } catch {
      // Trend analysis is optional
    }
  }
}

async function runTrendAnalysis(
  category: string,
  items: { title?: string }[],
): Promise<import('@/lib/types/trends').TrendAnomaly[]> {
  const currentCounts = countKeywordsInItems(items, category);
  const baselineCounts = await getBaselineCounts(category);
  const trends = calculateTrends(currentCounts, baselineCounts, category);
  const anomalies = detectAnomalies(trends);
  await recordTrends(trends);
  return anomalies;
}
