/**
 * Rhetoric-to-keyword gap analysis.
 *
 * Queries documents from rhetoric sources (whitehouse, gdelt) and surfaces
 * high-frequency terms that appear in N+ documents for a category but are
 * absent from the keyword dictionaries in assessment-rules.ts.
 *
 * Pure functions are exported for testing. DB access is isolated in
 * analyzeRhetoricGaps().
 *
 * Usage:
 *   pnpm seed:rhetoric-gaps                    # Analyze all categories
 *   pnpm seed:rhetoric-gaps --category courts   # Single category
 *   pnpm seed:rhetoric-gaps --min-docs 5        # Minimum document threshold
 *   pnpm seed:rhetoric-gaps --out ./my-dir      # Custom output directory
 */

import fs from 'fs';
import path from 'path';
import { ASSESSMENT_RULES } from '@/lib/data/assessment-rules';
import type { AssessmentRules } from '@/lib/types';

// --- Types ---

export interface TermFrequency {
  term: string;
  count: number;
  categories: string[];
}

export interface GapResult {
  term: string;
  count: number;
  category: string;
}

export interface CategoryGapReport {
  category: string;
  totalDocuments: number;
  gaps: GapResult[];
}

export interface RhetoricGapReport {
  generatedAt: string;
  minDocThreshold: number;
  categories: CategoryGapReport[];
}

// --- Constants ---

const DEFAULT_MIN_DOCS = 3;

// prettier-ignore
const STOPWORD_LIST =
  'the a an and or but in on at to for of with by from is are was were be been ' +
  'has have had do does did will would could should may might shall can not no nor so ' +
  'if then than that this these those it its as up out about into over after before between ' +
  'under above such each which their there what when where who how all any both more most ' +
  'other some only own same just also very even new first last one two three four five ' +
  'said says say told according per via since while during through still being here now ' +
  'get got make made us we he she they you i my your his her our them him me am';

const STOPWORDS = new Set(STOPWORD_LIST.split(' '));

// --- Pure functions ---

/** Extract bigrams from a title string, filtering stopwords. */
export function extractBigrams(title: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));

  const bigrams: string[] = [];
  for (let i = 0; i < words.length - 1; i++) {
    bigrams.push(`${words[i]} ${words[i + 1]}`);
  }
  return bigrams;
}

/** Collect all existing keywords for a category across all tiers. */
export function getAllKeywords(rules: AssessmentRules, category: string): Set<string> {
  const rule = rules[category];
  if (!rule) return new Set();

  const all = [...rule.keywords.capture, ...rule.keywords.drift, ...rule.keywords.warning];
  return new Set(all.map((k) => k.toLowerCase()));
}

/** Count bigram frequencies across documents, returning terms above threshold. */
export function countTermFrequencies(titles: string[], minDocs: number): TermFrequency[] {
  const counts = new Map<string, number>();

  for (const title of titles) {
    // Deduplicate bigrams within a single title
    const seen = new Set<string>();
    for (const bigram of extractBigrams(title)) {
      if (!seen.has(bigram)) {
        seen.add(bigram);
        counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
      }
    }
  }

  return [...counts.entries()]
    .filter(([, count]) => count >= minDocs)
    .map(([term, count]) => ({ term, count, categories: [] }))
    .sort((a, b) => b.count - a.count);
}

/** Filter term frequencies to only those not in the keyword dictionary. */
export function findGaps(termFreqs: TermFrequency[], existingKeywords: Set<string>): GapResult[] {
  return termFreqs
    .filter((tf) => !existingKeywords.has(tf.term))
    .map((tf) => ({ term: tf.term, count: tf.count, category: '' }));
}

/** Format the gap report as Markdown. */
export function formatGapMarkdown(report: RhetoricGapReport): string {
  const lines: string[] = [
    '# Rhetoric-to-Keyword Gap Analysis',
    '',
    `Generated: ${report.generatedAt}`,
    `Minimum document threshold: ${report.minDocThreshold}`,
    '',
  ];

  const totalGaps = report.categories.reduce((sum, c) => sum + c.gaps.length, 0);
  if (totalGaps === 0) {
    lines.push(
      'No gaps found. All high-frequency rhetoric terms are already in keyword dictionaries.',
    );
    return lines.join('\n');
  }

  lines.push(`Total gaps found: ${totalGaps}`, '');

  for (const cat of report.categories) {
    if (cat.gaps.length === 0) continue;
    lines.push(`## ${cat.category} (${cat.totalDocuments} documents)`, '');
    lines.push('| Term | Document Count |');
    lines.push('|------|---------------|');
    for (const gap of cat.gaps) {
      lines.push(`| ${gap.term} | ${gap.count} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

// --- DB query types ---

export interface DocumentTitle {
  category: string;
  title: string;
}

/** Build gap report from document titles (pure — no DB dependency). */
export function buildGapReport(
  titlesByCategory: Map<string, string[]>,
  rules: AssessmentRules,
  minDocs: number,
): RhetoricGapReport {
  const categories: CategoryGapReport[] = [];

  for (const [category, titles] of titlesByCategory) {
    const existingKeywords = getAllKeywords(rules, category);
    const termFreqs = countTermFrequencies(titles, minDocs);
    const gaps = findGaps(termFreqs, existingKeywords);

    categories.push({
      category,
      totalDocuments: titles.length,
      gaps: gaps.map((g) => ({ ...g, category })),
    });
  }

  categories.sort((a, b) => b.gaps.length - a.gaps.length);

  return {
    generatedAt: new Date().toISOString(),
    minDocThreshold: minDocs,
    categories,
  };
}

// --- DB + I/O ---

async function fetchRhetoricTitles(category?: string): Promise<Map<string, string[]>> {
  const { sql } = await import('drizzle-orm');
  const { getDb } = await import('@/lib/db');

  const db = getDb();
  const titlesByCategory = new Map<string, string[]>();

  const categoryFilter = category ? sql`AND category = ${category}` : sql``;

  const rows = await db.execute(sql`
    SELECT category, title
    FROM documents
    WHERE source_type = 'rhetoric' -- TODO(#28): normalize source_type to origin values
      AND title IS NOT NULL
      ${categoryFilter}
    ORDER BY category
  `);

  for (const row of rows.rows as DocumentTitle[]) {
    const titles = titlesByCategory.get(row.category) ?? [];
    titles.push(row.title);
    titlesByCategory.set(row.category, titles);
  }

  return titlesByCategory;
}

export async function analyzeRhetoricGaps(options?: {
  category?: string;
  minDocs?: number;
  outDir?: string;
}): Promise<RhetoricGapReport> {
  const { isDbAvailable } = await import('@/lib/db');

  if (!isDbAvailable()) {
    throw new Error('DATABASE_URL not configured');
  }

  const minDocs = options?.minDocs ?? DEFAULT_MIN_DOCS;
  const titlesByCategory = await fetchRhetoricTitles(options?.category);

  console.log(`[rhetoric-gaps] Fetched titles for ${titlesByCategory.size} categories`);

  const report = buildGapReport(titlesByCategory, ASSESSMENT_RULES, minDocs);

  const outDir = options?.outDir ?? path.resolve(__dirname, 'reports');
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'rhetoric-gaps.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`[rhetoric-gaps] JSON → ${jsonPath}`);

  const mdPath = path.join(outDir, 'rhetoric-gaps.md');
  fs.writeFileSync(mdPath, formatGapMarkdown(report));
  console.log(`[rhetoric-gaps] Markdown → ${mdPath}`);

  const totalGaps = report.categories.reduce((sum, c) => sum + c.gaps.length, 0);
  console.log(
    `[rhetoric-gaps] Found ${totalGaps} gaps across ${report.categories.length} categories`,
  );

  return report;
}

// --- CLI entry ---

interface CliOptions {
  category?: string;
  minDocs?: number;
  outDir?: string;
}

function parseCliArgs(args: string[]): CliOptions {
  const opts: CliOptions = {};
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--category':
        opts.category = args[++i];
        break;
      case '--min-docs':
        opts.minDocs = parseInt(args[++i], 10);
        break;
      case '--out':
        opts.outDir = args[++i];
        break;
    }
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const opts = parseCliArgs(process.argv.slice(2));

  analyzeRhetoricGaps(opts)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[rhetoric-gaps] Fatal error:', err);
      process.exit(1);
    });
}
