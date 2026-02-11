/**
 * Generate a review report surfacing AI Skeptic disagreements for human review.
 *
 * Usage:
 *   pnpm seed:review                           # Generate Markdown report
 *   pnpm seed:review --interactive              # Interactive CLI review
 *   pnpm seed:review --approve-ai               # Bulk approve AI recommendations
 *   pnpm seed:review --status                   # Show pending/resolved counts
 *   pnpm seed:review --export                   # Export resolved decisions to JSON
 *   pnpm seed:review --reset                    # Un-resolve all reviews (back to pending)
 *   pnpm seed:review --reviewer "Name"          # Set reviewer name
 *   pnpm seed:review --out ./my-dir             # Custom output directory
 */

import fs from 'fs';
import path from 'path';
import { and, eq, isNotNull } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { assessments } from '@/lib/db/schema';
import type { AssessmentRow } from '@/lib/services/snapshot-store';
import { rowToAssessment } from '@/lib/services/snapshot-store';
import { statusDistance } from '@/lib/services/status-ordering';
import type { EnhancedAssessment, StatusLevel } from '@/lib/types';
import { toDateString } from '@/lib/utils/date-utils';

// --- Types ---

export interface ReviewItem {
  id: string;
  category: string;
  date: string;
  keywordStatus: string;
  aiRecommendedStatus?: string;
  finalStatus: string;
  confidence?: number;
  aiReasoning?: string;
  gapExplanation: string;
  keywordMatches: string[];
  topMatches: Array<{ keyword: string; assessment: string; reasoning: string }>;
}

// --- Pure functions ---

export function buildReviewId(category: string, date: string): string {
  return `${category}--${date}`;
}

export function buildGapExplanation(
  keywordStatus: string,
  aiRecommendedStatus: string | undefined,
  confidence: number | undefined,
): string {
  if (!aiRecommendedStatus) {
    return 'AI review pending — no recommendation available';
  }

  const gap = statusDistance(keywordStatus as StatusLevel, aiRecommendedStatus as StatusLevel);

  if (gap >= 2) {
    return `AI recommends ${aiRecommendedStatus} (${gap} levels from keyword ${keywordStatus}) — large gap flagged for review`;
  }

  if (confidence !== undefined && confidence < 0.7) {
    return `AI confidence ${(confidence * 100).toFixed(0)}% below 70% threshold — flagged for review`;
  }

  return `AI recommends ${aiRecommendedStatus} vs keyword ${keywordStatus} — flagged for review`;
}

export function extractReviewItem(assessment: EnhancedAssessment): ReviewItem | null {
  if (!assessment.flaggedForReview) return null;

  const date = assessment.assessedAt?.split('T')[0] ?? 'unknown';
  const cat = assessment.category;

  return {
    id: buildReviewId(cat, date),
    category: cat,
    date,
    keywordStatus: assessment.keywordResult.status,
    aiRecommendedStatus: assessment.recommendedStatus,
    finalStatus: assessment.status,
    confidence: assessment.aiResult?.confidence,
    aiReasoning: assessment.aiResult?.reasoning,
    gapExplanation: buildGapExplanation(
      assessment.keywordResult.status,
      assessment.recommendedStatus,
      assessment.aiResult?.confidence,
    ),
    keywordMatches: assessment.matches,
    topMatches: (assessment.keywordReview ?? []).map((kr) => ({
      keyword: kr.keyword,
      assessment: kr.assessment,
      reasoning: kr.reasoning,
    })),
  };
}

export function sortReviewItems(items: ReviewItem[]): ReviewItem[] {
  return [...items].sort((a, b) => {
    const catCmp = a.category.localeCompare(b.category);
    if (catCmp !== 0) return catCmp;
    return b.date.localeCompare(a.date);
  });
}

export function formatSummaryTable(items: ReviewItem[]): string {
  const counts: Record<string, number> = {};
  for (const item of items) {
    counts[item.category] = (counts[item.category] ?? 0) + 1;
  }

  const categories = Object.keys(counts).sort();
  const lines = [
    '| Category | Count |',
    '|----------|-------|',
    ...categories.map((cat) => `| ${cat} | ${counts[cat]} |`),
    `| **Total** | **${items.length}** |`,
  ];
  return lines.join('\n');
}

export function formatReviewItem(item: ReviewItem): string {
  const lines: string[] = [
    `### ${item.id}`,
    '',
    `- **Category:** ${item.category}`,
    `- **Date:** ${item.date}`,
    `- **Keyword Status:** ${item.keywordStatus}`,
    `- **AI Recommended:** ${item.aiRecommendedStatus ?? 'N/A'}`,
    `- **Final Status:** ${item.finalStatus}`,
  ];
  if (item.confidence !== undefined) {
    lines.push(`- **Confidence:** ${(item.confidence * 100).toFixed(0)}%`);
  }
  lines.push(`- **Gap:** ${item.gapExplanation}`);

  if (item.aiReasoning) {
    lines.push('', `> ${item.aiReasoning}`);
  }

  if (item.topMatches.length > 0) {
    lines.push('', '**Keyword Verdicts:**');
    for (const m of item.topMatches) {
      lines.push(`  - \`${m.keyword}\` — ${m.assessment}: ${m.reasoning}`);
    }
  }

  return lines.join('\n');
}

export function formatReportMarkdown(items: ReviewItem[]): string {
  const sorted = sortReviewItems(items);
  const sections = [
    '# AI Skeptic Review Report',
    '',
    `Generated: ${toDateString(new Date())}`,
    '',
    '## Summary',
    '',
    formatSummaryTable(sorted),
    '',
    '## Review Items',
    '',
    ...sorted.map(formatReviewItem),
  ];
  return sections.join('\n');
}

// --- DB function ---

export async function fetchAllReviewItems(): Promise<ReviewItem[]> {
  const db = getDb();
  const categoryKeys = CATEGORIES.map((c) => c.key);
  const allItems: ReviewItem[] = [];

  for (const category of categoryKeys) {
    const rows = await db
      .select()
      .from(assessments)
      .where(and(eq(assessments.category, category), isNotNull(assessments.aiProvider)));

    for (const row of rows) {
      const assessment = rowToAssessment(row as unknown as AssessmentRow);
      if (assessment) {
        const item = extractReviewItem(assessment);
        if (item) allItems.push(item);
      }
    }
  }

  return sortReviewItems(allItems);
}

// --- Entry point ---

export async function generateReviewReport(options?: { outDir?: string }): Promise<void> {
  if (!isDbAvailable()) {
    throw new Error('DATABASE_URL not configured');
  }

  const outDir = options?.outDir ?? path.resolve(__dirname, 'reports');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('[seed:review] Fetching review items...');
  const items = await fetchAllReviewItems();
  console.log(`[seed:review] Found ${items.length} review items`);

  const report = formatReportMarkdown(items);
  const reportPath = path.join(outDir, 'review-report.md');
  fs.writeFileSync(reportPath, report);
  console.log(`[seed:review] Report → ${reportPath}`);

  console.log('[seed:review] Done.');
}

interface CliOptions {
  outDir?: string;
  interactive?: boolean;
  approveAi?: boolean;
  reviewer?: string;
  status?: boolean;
  exportJson?: boolean;
  reset?: boolean;
}

function parseCliArgs(args: string[]): CliOptions {
  const opts: CliOptions = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--out':
        opts.outDir = args[++i];
        break;
      case '--interactive':
        opts.interactive = true;
        break;
      case '--approve-ai':
        opts.approveAi = true;
        break;
      case '--reviewer':
        opts.reviewer = args[++i];
        break;
      case '--status':
        opts.status = true;
        break;
      case '--export':
        opts.exportJson = true;
        break;
      case '--reset':
        opts.reset = true;
        break;
    }
  }
  return opts;
}

async function exportDecisions(outDir?: string): Promise<void> {
  const { getResolvedReviews } = await import('@/lib/services/review-queue');
  const resolved = await getResolvedReviews();
  const dir = outDir ?? path.resolve(__dirname, 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const exportPath = path.join(dir, 'review-decisions.json');
  const exportData = {
    metadata: { exportedAt: new Date().toISOString(), totalItems: resolved.length },
    decisions: resolved.map((r) => ({
      id: `${r.category}--${r.createdAt ? toDateString(r.createdAt) : 'unknown'}`,
      alertId: r.id,
      category: r.category,
      resolution: (r.metadata as Record<string, unknown>)?.resolution ?? null,
    })),
  };
  fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
  console.log(`[seed:review] Exported ${resolved.length} decisions → ${exportPath}`);
}

async function runCli(opts: CliOptions): Promise<void> {
  if (opts.reset) {
    const { resetResolvedReviews } = await import('@/lib/services/review-queue');
    const count = await resetResolvedReviews();
    console.log(`[seed:review] Reset ${count} resolved reviews back to pending`);
    return;
  }

  if (opts.status) {
    const { formatProgressSummary } = await import('./interactive-review');
    const { getPendingReviews, getResolvedReviews } = await import('@/lib/services/review-queue');
    const pending = await getPendingReviews();
    const resolved = await getResolvedReviews();
    console.log(formatProgressSummary(pending.length, resolved.length));
    return;
  }

  if (opts.approveAi) {
    const { bulkApproveAi } = await import('./interactive-review');
    const { getPendingReviews, resolveReview } = await import('@/lib/services/review-queue');
    const pending = await getPendingReviews();
    const reviewer = opts.reviewer ?? 'cli-bulk';
    const resolveArgsList = bulkApproveAi(pending, reviewer);
    for (const resolveArgs of resolveArgsList) {
      await resolveReview(resolveArgs.alertId, resolveArgs.decision);
    }
    console.log(`[seed:review] Bulk approved ${resolveArgsList.length} items as "${reviewer}"`);
    return;
  }

  if (opts.exportJson) return exportDecisions(opts.outDir);
  if (opts.interactive) {
    const { runInteractiveReview } = await import('./interactive-review');
    await runInteractiveReview({ reviewer: opts.reviewer });
    return;
  }

  // Default: generate Markdown report
  await generateReviewReport({ outDir: opts.outDir });
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const opts = parseCliArgs(process.argv.slice(2));

  runCli(opts)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed:review] Fatal error:', err);
      process.exit(1);
    });
}
