/**
 * Generate a review report surfacing AI Skeptic disagreements for human review.
 *
 * Usage:
 *   pnpm seed:review                  # Generate report in lib/seed/reports/
 *   pnpm seed:review --out ./my-dir   # Custom output directory
 */

import fs from 'fs';
import path from 'path';
import { and, eq, isNotNull } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { assessments } from '@/lib/db/schema';
import type { AssessmentRow } from '@/lib/services/snapshot-store';
import { rowToAssessment } from '@/lib/services/snapshot-store';
import type { EnhancedAssessment } from '@/lib/types';
import { toDateString } from '@/lib/utils/date-utils';
import type { ReviewDecisionsFile } from './review-decisions';

// --- Types ---

export type FlagType = 'downgrade' | 'false-positive' | 'ambiguous' | 'low-confidence';

const FLAG_TYPE_ORDER: FlagType[] = ['downgrade', 'false-positive', 'ambiguous', 'low-confidence'];

const LOW_CONFIDENCE_THRESHOLD = 0.7;

export interface FlaggedItem {
  id: string;
  category: string;
  date: string;
  flagType: FlagType;
  status: string;
  recommendedStatus?: string;
  detail: string;
  keyword?: string;
  confidence?: number;
}

// --- Pure functions ---

export function buildFlagId(
  category: string,
  date: string,
  flagType: FlagType,
  index: number,
): string {
  return `${category}--${date}--${flagType}--${index}`;
}

function extractKeywordFlags(
  assessment: EnhancedAssessment,
  cat: string,
  date: string,
): FlaggedItem[] {
  const items: FlaggedItem[] = [];
  let fpIndex = 0;
  let ambigIndex = 0;
  for (const kr of assessment.keywordReview ?? []) {
    const flagType =
      kr.assessment === 'false_positive'
        ? 'false-positive'
        : kr.assessment === 'ambiguous'
          ? 'ambiguous'
          : null;
    if (!flagType) continue;
    const idx = flagType === 'false-positive' ? fpIndex++ : ambigIndex++;
    items.push({
      id: buildFlagId(cat, date, flagType, idx),
      category: cat,
      date,
      flagType,
      status: assessment.status,
      detail: kr.reasoning,
      keyword: kr.keyword,
    });
  }
  return items;
}

export function extractFlaggedItems(assessment: EnhancedAssessment): FlaggedItem[] {
  const items: FlaggedItem[] = [];
  const date = assessment.assessedAt?.split('T')[0] ?? 'unknown';
  const cat = assessment.category;
  const hasDowngrade = assessment.downgradeApplied || assessment.flaggedForReview;

  if (hasDowngrade) {
    items.push({
      id: buildFlagId(cat, date, 'downgrade', 0),
      category: cat,
      date,
      flagType: 'downgrade',
      status: assessment.status,
      recommendedStatus: assessment.recommendedStatus,
      detail: assessment.aiResult?.reasoning ?? assessment.reason,
      confidence: assessment.aiResult?.confidence,
    });
  }

  items.push(...extractKeywordFlags(assessment, cat, date));

  const confidence = assessment.aiResult?.confidence;
  if (!hasDowngrade && confidence !== undefined && confidence < LOW_CONFIDENCE_THRESHOLD) {
    items.push({
      id: buildFlagId(cat, date, 'low-confidence', 0),
      category: cat,
      date,
      flagType: 'low-confidence',
      status: assessment.status,
      detail: `AI confidence ${(confidence * 100).toFixed(0)}% — below ${LOW_CONFIDENCE_THRESHOLD * 100}% threshold`,
      confidence,
    });
  }

  return items;
}

export function sortFlaggedItems(items: FlaggedItem[]): FlaggedItem[] {
  return [...items].sort((a, b) => {
    // By category
    const catCmp = a.category.localeCompare(b.category);
    if (catCmp !== 0) return catCmp;
    // By flag type severity
    const aIdx = FLAG_TYPE_ORDER.indexOf(a.flagType);
    const bIdx = FLAG_TYPE_ORDER.indexOf(b.flagType);
    if (aIdx !== bIdx) return aIdx - bIdx;
    // Most recent first
    return b.date.localeCompare(a.date);
  });
}

export function formatSummaryTable(items: FlaggedItem[]): string {
  const counts: Record<FlagType, number> = {
    downgrade: 0,
    'false-positive': 0,
    ambiguous: 0,
    'low-confidence': 0,
  };
  for (const item of items) counts[item.flagType]++;

  const lines = [
    '| Flag Type | Count |',
    '|-----------|-------|',
    ...FLAG_TYPE_ORDER.map((ft) => `| ${ft} | ${counts[ft]} |`),
    `| **Total** | **${items.length}** |`,
  ];
  return lines.join('\n');
}

export function formatFlaggedItem(item: FlaggedItem): string {
  const lines: string[] = [
    `### ${item.id}`,
    '',
    `- **Category:** ${item.category}`,
    `- **Date:** ${item.date}`,
    `- **Flag:** ${item.flagType}`,
    `- **Current Status:** ${item.status}`,
  ];
  if (item.recommendedStatus) lines.push(`- **Recommended:** ${item.recommendedStatus}`);
  if (item.keyword) lines.push(`- **Keyword:** \`${item.keyword}\``);
  if (item.confidence !== undefined)
    lines.push(`- **Confidence:** ${(item.confidence * 100).toFixed(0)}%`);
  lines.push('', `> ${item.detail}`);
  return lines.join('\n');
}

export function formatReportMarkdown(items: FlaggedItem[]): string {
  const sorted = sortFlaggedItems(items);
  const sections = [
    '# AI Skeptic Review Report',
    '',
    `Generated: ${toDateString(new Date())}`,
    '',
    '## Summary',
    '',
    formatSummaryTable(sorted),
    '',
    '## Flagged Items',
    '',
    ...sorted.map(formatFlaggedItem),
  ];
  return sections.join('\n');
}

export function buildDecisionsTemplate(items: FlaggedItem[]): ReviewDecisionsFile {
  return {
    metadata: {
      generatedAt: new Date().toISOString(),
      totalItems: items.length,
    },
    decisions: items.map((item) => ({
      id: item.id,
      decision: 'pending' as const,
    })),
  };
}

// --- DB function ---

export async function fetchAllFlaggedItems(): Promise<FlaggedItem[]> {
  const db = getDb();
  const categoryKeys = CATEGORIES.map((c) => c.key);
  const allItems: FlaggedItem[] = [];

  for (const category of categoryKeys) {
    const rows = await db
      .select()
      .from(assessments)
      .where(and(eq(assessments.category, category), isNotNull(assessments.aiProvider)));

    for (const row of rows) {
      const assessment = rowToAssessment(row as unknown as AssessmentRow);
      if (assessment) {
        allItems.push(...extractFlaggedItems(assessment));
      }
    }
  }

  return sortFlaggedItems(allItems);
}

// --- Entry point ---

export async function generateReviewReport(options?: { outDir?: string }): Promise<void> {
  if (!isDbAvailable()) {
    throw new Error('DATABASE_URL not configured');
  }

  const outDir = options?.outDir ?? path.resolve(__dirname, 'reports');
  fs.mkdirSync(outDir, { recursive: true });

  console.log('[seed:review] Fetching flagged items...');
  const items = await fetchAllFlaggedItems();
  console.log(`[seed:review] Found ${items.length} flagged items`);

  const report = formatReportMarkdown(items);
  const reportPath = path.join(outDir, 'review-report.md');
  fs.writeFileSync(reportPath, report);
  console.log(`[seed:review] Report → ${reportPath}`);

  const template = buildDecisionsTemplate(items);
  const templatePath = path.join(outDir, 'review-decisions.json');
  fs.writeFileSync(templatePath, JSON.stringify(template, null, 2));
  console.log(`[seed:review] Decisions template → ${templatePath}`);

  console.log('[seed:review] Done.');
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const args = process.argv.slice(2);
  let outDir: string | undefined;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') outDir = args[++i];
  }

  generateReviewReport({ outDir })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[seed:review] Fatal error:', err);
      process.exit(1);
    });
}
