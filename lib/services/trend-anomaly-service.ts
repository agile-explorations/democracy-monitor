import type { KeywordTrend, TrendAnomaly } from '@/lib/types/trends';
import { isDbAvailable, getDb } from '@/lib/db';
import { keywordTrends } from '@/lib/db/schema';
import { eq, gte, and } from 'drizzle-orm';
import { ASSESSMENT_RULES } from '@/lib/data/assessment-rules';

const ANOMALY_THRESHOLD = 2.0; // 2x baseline = anomaly

export function detectAnomalies(trends: KeywordTrend[]): TrendAnomaly[] {
  return trends
    .filter((t) => t.isAnomaly)
    .map((t) => ({
      keyword: t.keyword,
      category: t.category,
      ratio: t.ratio,
      severity:
        t.ratio >= 5 ? ('high' as const) : t.ratio >= 3 ? ('medium' as const) : ('low' as const),
      message: `"${t.keyword}" appeared ${t.currentCount} times (${t.ratio.toFixed(1)}x above 6-month baseline of ${t.baselineAvg.toFixed(1)})`,
      detectedAt: new Date().toISOString(),
    }));
}

export function calculateTrends(
  currentCounts: Record<string, number>,
  baselineCounts: Record<string, number>,
  category: string,
): KeywordTrend[] {
  const now = new Date();
  const periodStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const periodEnd = now.toISOString();

  return Object.entries(currentCounts).map(([keyword, count]) => {
    const baseline = baselineCounts[keyword] || 0;
    const ratio = baseline > 0 ? count / baseline : count > 0 ? Infinity : 0;

    return {
      keyword,
      category,
      currentCount: count,
      baselineAvg: baseline,
      ratio,
      isAnomaly: ratio >= ANOMALY_THRESHOLD && count >= 2,
      periodStart,
      periodEnd,
    };
  });
}

export function countKeywordsInItems(
  items: Array<{ title?: string; summary?: string }>,
  category: string,
): Record<string, number> {
  const rules = ASSESSMENT_RULES[category];
  if (!rules?.keywords) return {};

  const allKeywords = [
    ...(rules.keywords.capture || []),
    ...(rules.keywords.drift || []),
    ...(rules.keywords.warning || []),
  ];

  const counts: Record<string, number> = {};

  for (const keyword of allKeywords) {
    const lowerKeyword = keyword.toLowerCase();
    let count = 0;

    for (const item of items) {
      const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
      if (text.includes(lowerKeyword)) count++;
    }

    if (count > 0) {
      counts[keyword] = count;
    }
  }

  return counts;
}

export async function recordTrends(trends: KeywordTrend[]): Promise<void> {
  if (!isDbAvailable()) return;

  const db = getDb();
  for (const trend of trends) {
    await db.insert(keywordTrends).values({
      keyword: trend.keyword,
      category: trend.category,
      count: trend.currentCount,
      baselineAvg: trend.baselineAvg,
      ratio: trend.ratio,
      isAnomaly: trend.isAnomaly,
      periodStart: new Date(trend.periodStart),
      periodEnd: new Date(trend.periodEnd),
    });
  }
}

export async function getBaselineCounts(category: string): Promise<Record<string, number>> {
  if (!isDbAvailable()) return {};

  const db = getDb();
  const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000);

  const rows = await db
    .select()
    .from(keywordTrends)
    .where(and(eq(keywordTrends.category, category), gte(keywordTrends.periodStart, sixMonthsAgo)));

  const baselines: Record<string, { total: number; count: number }> = {};

  for (const row of rows) {
    if (!baselines[row.keyword]) {
      baselines[row.keyword] = { total: 0, count: 0 };
    }
    baselines[row.keyword].total += row.count;
    baselines[row.keyword].count++;
  }

  const result: Record<string, number> = {};
  for (const [keyword, data] of Object.entries(baselines)) {
    result[keyword] = data.count > 0 ? data.total / data.count : 0;
  }

  return result;
}
