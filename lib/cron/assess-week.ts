/**
 * Shared assessment helper for backfill and baseline scripts.
 * Runs either keyword-only or AI-enhanced assessment based on options.
 */

import { enhancedAssessment } from '@/lib/services/ai-assessment-service';
import { analyzeContent } from '@/lib/services/assessment-service';
import type { CycleAdjustmentFactor } from '@/lib/services/cycle-adjustment-service';
import type { ContentItem, EnhancedAssessment } from '@/lib/types';

export interface AiOptions {
  skipAi: boolean;
  model?: string;
  cycleFactors?: Map<string, CycleAdjustmentFactor>;
}

function buildKeywordOnlyResult(
  items: ContentItem[],
  categoryKey: string,
  weekEnd: string,
  cycleFactors?: Map<string, CycleAdjustmentFactor>,
): EnhancedAssessment {
  const assessment = analyzeContent(items, categoryKey, cycleFactors);
  return {
    category: categoryKey,
    status: assessment.status,
    reason: assessment.reason,
    matches: assessment.matches,
    dataCoverage: items.length > 0 ? Math.min(items.length / 10, 1) : 0,
    evidenceFor: [],
    evidenceAgainst: [],
    howWeCouldBeWrong: [],
    keywordResult: assessment,
    assessedAt: new Date(weekEnd).toISOString(),
  };
}

export async function assessWeek(
  items: ContentItem[],
  categoryKey: string,
  weekEnd: string,
  aiOptions: AiOptions,
): Promise<EnhancedAssessment> {
  if (aiOptions.skipAi) {
    return buildKeywordOnlyResult(items, categoryKey, weekEnd, aiOptions.cycleFactors);
  }

  return enhancedAssessment(items, categoryKey, {
    skipCache: true,
    ...(aiOptions.model ? { model: aiOptions.model } : {}),
    cycleFactors: aiOptions.cycleFactors,
  });
}
