/**
 * Post-session aggregate feedback report.
 *
 * After completing all interactive reviews, this module reads resolved reviews
 * from the alerts table and synthesizes feedback patterns into specific,
 * actionable keyword dictionary recommendations.
 *
 * Pure functions are exported for testing. DB access is isolated in
 * generateAggregateReport().
 */

import fs from 'fs';
import path from 'path';
import type { ReviewFeedback } from '@/lib/seed/review-decisions';

// --- Types ---

interface ResolvedAlert {
  id: number;
  category: string;
  metadata: unknown;
}

interface FeedbackEntry {
  category: string;
  feedback: ReviewFeedback;
}

export interface KeywordRecommendation {
  keyword: string;
  category: string;
  action: 'remove' | 'move';
  currentTier?: string;
  suggestedTier?: string;
  reason: string;
  occurrences: number;
  fpRate: number;
}

export interface SuppressionRecommendation {
  pattern: string;
  category: string;
  occurrences: number;
}

export interface AggregateReport {
  generatedAt: string;
  totalResolved: number;
  totalWithFeedback: number;
  keywordRecommendations: KeywordRecommendation[];
  suppressionRecommendations: SuppressionRecommendation[];
}

// --- Pure functions ---

const FP_THRESHOLD = 0.5;

/** Extract feedback entries from resolved alerts. */
export function extractFeedbackEntries(alerts: ResolvedAlert[]): FeedbackEntry[] {
  const entries: FeedbackEntry[] = [];

  for (const alert of alerts) {
    const meta = (alert.metadata ?? {}) as Record<string, unknown>;
    const resolution = meta.resolution as Record<string, unknown> | undefined;
    if (!resolution?.feedback) continue;

    const feedback = resolution.feedback as ReviewFeedback;
    const hasContent =
      feedback.falsePositiveKeywords?.length ||
      feedback.suppressionSuggestions?.length ||
      feedback.tierChanges?.length;
    if (!hasContent) continue;

    entries.push({ category: alert.category, feedback });
  }

  return entries;
}

/** Count how many times each keyword was flagged as a false positive per category. */
export function aggregateFalsePositives(
  entries: FeedbackEntry[],
): Map<string, { count: number; total: number; categories: Set<string> }> {
  const fpCounts = new Map<string, { count: number; total: number; categories: Set<string> }>();

  for (const { category, feedback } of entries) {
    for (const kw of feedback.falsePositiveKeywords ?? []) {
      const key = kw.toLowerCase();
      const existing = fpCounts.get(key) ?? { count: 0, total: 0, categories: new Set<string>() };
      existing.count += 1;
      existing.categories.add(category);
      fpCounts.set(key, existing);
    }
  }

  // Count total reviews per category to compute rates
  const categoryReviewCounts = new Map<string, number>();
  for (const { category } of entries) {
    categoryReviewCounts.set(category, (categoryReviewCounts.get(category) ?? 0) + 1);
  }

  for (const [, data] of fpCounts) {
    let total = 0;
    for (const cat of data.categories) {
      total += categoryReviewCounts.get(cat) ?? 0;
    }
    data.total = total;
  }

  return fpCounts;
}

/** Aggregate tier change suggestions across reviews. */
export function aggregateTierChanges(
  entries: FeedbackEntry[],
): Map<
  string,
  { keyword: string; suggestedTier: string; currentTier: string; count: number; reasons: string[] }
> {
  const changes = new Map<
    string,
    {
      keyword: string;
      suggestedTier: string;
      currentTier: string;
      count: number;
      reasons: string[];
    }
  >();

  for (const { feedback } of entries) {
    for (const tc of feedback.tierChanges ?? []) {
      const key = `${tc.keyword}::${tc.suggestedTier}`;
      const existing = changes.get(key) ?? {
        keyword: tc.keyword,
        suggestedTier: tc.suggestedTier,
        currentTier: tc.currentTier,
        count: 0,
        reasons: [],
      };
      existing.count += 1;
      if (tc.reason && !existing.reasons.includes(tc.reason)) {
        existing.reasons.push(tc.reason);
      }
      changes.set(key, existing);
    }
  }

  return changes;
}

/** Aggregate suppression pattern suggestions. */
export function aggregateSuppressions(
  entries: FeedbackEntry[],
): Map<string, { count: number; category: string }> {
  const suppressions = new Map<string, { count: number; category: string }>();

  for (const { category, feedback } of entries) {
    for (const pattern of feedback.suppressionSuggestions ?? []) {
      const existing = suppressions.get(pattern) ?? { count: 0, category };
      existing.count += 1;
      suppressions.set(pattern, existing);
    }
  }

  return suppressions;
}

/** Build final aggregate report from resolved alerts. */
export function buildAggregateReport(alerts: ResolvedAlert[]): AggregateReport {
  const entries = extractFeedbackEntries(alerts);
  const fpMap = aggregateFalsePositives(entries);
  const tierMap = aggregateTierChanges(entries);
  const suppressionMap = aggregateSuppressions(entries);

  const keywordRecommendations: KeywordRecommendation[] = [];

  // False positive removals
  for (const [keyword, data] of fpMap) {
    const fpRate = data.total > 0 ? data.count / data.total : 0;
    if (fpRate >= FP_THRESHOLD) {
      keywordRecommendations.push({
        keyword,
        category: [...data.categories].join(', '),
        action: 'remove',
        reason: `False positive in ${data.count}/${data.total} reviews (${(fpRate * 100).toFixed(0)}%)`,
        occurrences: data.count,
        fpRate,
      });
    }
  }

  // Tier changes
  for (const [, data] of tierMap) {
    if (data.count >= 2) {
      keywordRecommendations.push({
        keyword: data.keyword,
        category: '',
        action: 'move',
        currentTier: data.currentTier,
        suggestedTier: data.suggestedTier,
        reason: `Suggested ${data.count} time(s): ${data.reasons[0] ?? 'no reason given'}`,
        occurrences: data.count,
        fpRate: 0,
      });
    }
  }

  keywordRecommendations.sort((a, b) => b.occurrences - a.occurrences);

  const suppressionRecommendations: SuppressionRecommendation[] = [];
  for (const [pattern, data] of suppressionMap) {
    if (data.count >= 2) {
      suppressionRecommendations.push({
        pattern,
        category: data.category,
        occurrences: data.count,
      });
    }
  }
  suppressionRecommendations.sort((a, b) => b.occurrences - a.occurrences);

  return {
    generatedAt: new Date().toISOString(),
    totalResolved: alerts.length,
    totalWithFeedback: entries.length,
    keywordRecommendations,
    suppressionRecommendations,
  };
}

/** Format aggregate report as Markdown. */
export function formatAggregateMarkdown(report: AggregateReport): string {
  const lines: string[] = [
    '# Aggregate Keyword Feedback Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Total resolved reviews: ${report.totalResolved}`,
    `Reviews with feedback: ${report.totalWithFeedback}`,
    '',
  ];

  if (
    report.keywordRecommendations.length === 0 &&
    report.suppressionRecommendations.length === 0
  ) {
    lines.push('No actionable recommendations. All keywords performing as expected.');
    return lines.join('\n');
  }

  if (report.keywordRecommendations.length > 0) {
    lines.push('## Keyword Recommendations', '');
    lines.push('| Action | Keyword | Category | Detail | Occurrences |');
    lines.push('|--------|---------|----------|--------|-------------|');
    for (const rec of report.keywordRecommendations) {
      const detail =
        rec.action === 'remove'
          ? `FP rate: ${(rec.fpRate * 100).toFixed(0)}%`
          : `${rec.currentTier} → ${rec.suggestedTier}`;
      lines.push(
        `| ${rec.action} | ${rec.keyword} | ${rec.category} | ${detail} | ${rec.occurrences} |`,
      );
    }
    lines.push('');
  }

  if (report.suppressionRecommendations.length > 0) {
    lines.push('## Suppression Pattern Recommendations', '');
    lines.push('| Pattern | Category | Occurrences |');
    lines.push('|---------|----------|-------------|');
    for (const rec of report.suppressionRecommendations) {
      lines.push(`| ${rec.pattern} | ${rec.category} | ${rec.occurrences} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

/** Write aggregate report as both JSON and Markdown. */
export async function generateAggregateReport(outDir?: string): Promise<AggregateReport> {
  const { getResolvedReviews } = await import('@/lib/services/review-queue');

  const resolved = await getResolvedReviews();
  if (resolved.length === 0) {
    console.log('[seed:review] No resolved reviews to aggregate.');
    return buildAggregateReport([]);
  }

  const report = buildAggregateReport(resolved);
  const dir = outDir ?? path.resolve(__dirname, 'reports');
  fs.mkdirSync(dir, { recursive: true });

  const jsonPath = path.join(dir, 'aggregate-recommendations.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`[seed:review] Aggregate JSON → ${jsonPath}`);

  const mdPath = path.join(dir, 'aggregate-recommendations.md');
  fs.writeFileSync(mdPath, formatAggregateMarkdown(report));
  console.log(`[seed:review] Aggregate Markdown → ${mdPath}`);

  console.log(
    `[seed:review] ${report.keywordRecommendations.length} keyword recommendations, ` +
      `${report.suppressionRecommendations.length} suppression recommendations`,
  );

  return report;
}
