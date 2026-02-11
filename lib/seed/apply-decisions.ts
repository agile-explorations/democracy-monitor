/**
 * Apply aggregate keyword recommendations to assessment-rules.ts.
 *
 * Reads recommendations from aggregate-recommendations.json, generates a
 * preview of changes, and writes the updated assessment-rules.ts file.
 *
 * Pure functions are exported for testing. File I/O is isolated in
 * applyDecisions().
 */

import fs from 'fs';
import path from 'path';
import type { AssessmentRules, AssessmentRule } from '@/lib/types';
import type { AggregateReport, KeywordRecommendation } from './aggregate-feedback';

// --- Types ---

type Tier = 'capture' | 'drift' | 'warning';

export interface AppliedChange {
  keyword: string;
  category: string;
  action: 'removed' | 'moved' | 'added';
  fromTier?: Tier;
  toTier?: Tier;
}

// --- Pure functions ---

const VALID_TIERS: Tier[] = ['capture', 'drift', 'warning'];

function isTier(s: string): s is Tier {
  return VALID_TIERS.includes(s as Tier);
}

/** Find which tier a keyword belongs to in a given category's rules. */
export function findKeywordTier(rule: AssessmentRule, keyword: string): Tier | null {
  const lower = keyword.toLowerCase();
  for (const tier of VALID_TIERS) {
    if (rule.keywords[tier].includes(lower)) return tier;
  }
  return null;
}

/** Apply a single recommendation to a mutable rules object. Returns change or null. */
export function applyRecommendation(
  rules: AssessmentRules,
  rec: KeywordRecommendation,
): AppliedChange | null {
  const categories = rec.category
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);

  // For 'move' actions, apply across all categories that have the keyword
  if (rec.action === 'move' && rec.suggestedTier && isTier(rec.suggestedTier)) {
    const targetTier = rec.suggestedTier;
    const targetCategories = categories.length > 0 ? categories : Object.keys(rules);

    for (const cat of targetCategories) {
      const rule = rules[cat];
      if (!rule) continue;

      const currentTier = findKeywordTier(rule, rec.keyword);
      if (!currentTier || currentTier === targetTier) continue;

      rule.keywords[currentTier] = rule.keywords[currentTier].filter(
        (k) => k.toLowerCase() !== rec.keyword.toLowerCase(),
      );
      if (!rule.keywords[targetTier].includes(rec.keyword.toLowerCase())) {
        rule.keywords[targetTier].push(rec.keyword.toLowerCase());
      }

      return {
        keyword: rec.keyword,
        category: cat,
        action: 'moved',
        fromTier: currentTier,
        toTier: targetTier,
      };
    }
    return null;
  }

  // For 'remove' actions
  if (rec.action === 'remove') {
    const targetCategories = categories.length > 0 ? categories : Object.keys(rules);

    for (const cat of targetCategories) {
      const rule = rules[cat];
      if (!rule) continue;

      const currentTier = findKeywordTier(rule, rec.keyword);
      if (!currentTier) continue;

      rule.keywords[currentTier] = rule.keywords[currentTier].filter(
        (k) => k.toLowerCase() !== rec.keyword.toLowerCase(),
      );

      return {
        keyword: rec.keyword,
        category: cat,
        action: 'removed',
        fromTier: currentTier,
      };
    }
  }

  // For 'add' actions — insert keyword into specified tier
  if (rec.action === 'add' && rec.suggestedTier && isTier(rec.suggestedTier)) {
    const targetTier = rec.suggestedTier;

    for (const cat of categories) {
      const rule = rules[cat];
      if (!rule) continue;

      // Skip if keyword already exists in any tier
      if (findKeywordTier(rule, rec.keyword)) continue;

      rule.keywords[targetTier].push(rec.keyword.toLowerCase());

      return {
        keyword: rec.keyword,
        category: cat,
        action: 'added',
        toTier: targetTier,
      };
    }
  }

  return null;
}

/** Apply all recommendations and return list of changes made. */
export function applyAllRecommendations(
  rules: AssessmentRules,
  recommendations: KeywordRecommendation[],
): AppliedChange[] {
  const changes: AppliedChange[] = [];

  for (const rec of recommendations) {
    const change = applyRecommendation(rules, rec);
    if (change) changes.push(change);
  }

  return changes;
}

/** Serialize rules object to TypeScript source code. */
export function serializeRules(rules: AssessmentRules): string {
  const lines: string[] = [
    "import type { AssessmentRules } from '@/lib/types';",
    '',
    'export const ASSESSMENT_RULES: AssessmentRules = {',
  ];

  const categories = Object.keys(rules);
  for (let ci = 0; ci < categories.length; ci++) {
    const cat = categories[ci];
    const rule = rules[cat];
    lines.push(`  ${cat}: {`);
    lines.push('    keywords: {');

    for (const tier of VALID_TIERS) {
      const keywords = rule.keywords[tier];
      if (keywords.length === 0) {
        lines.push(`      ${tier}: [],`);
      } else {
        lines.push(`      ${tier}: [`);
        for (const kw of keywords) {
          lines.push(`        '${kw.replace(/'/g, "\\'")}',`);
        }
        lines.push('      ],');
      }
    }

    lines.push('    },');

    if (rule.volumeThreshold) {
      const vt = rule.volumeThreshold;
      lines.push(
        `    volumeThreshold: { warning: ${vt.warning}, drift: ${vt.drift}, capture: ${vt.capture} },`,
      );
    }

    if (rule.oversightGovDown) {
      lines.push(`    oversightGovDown: '${rule.oversightGovDown}',`);
    }

    lines.push(`  },`);
  }

  lines.push('};');
  lines.push('');

  return lines.join('\n');
}

/** Format changes as a human-readable diff preview. */
export function formatChangePreview(changes: AppliedChange[]): string {
  if (changes.length === 0) return 'No changes to apply.';

  const lines = [`${changes.length} change(s) to apply:`, ''];
  for (const c of changes) {
    if (c.action === 'removed') {
      lines.push(`  - REMOVE "${c.keyword}" from ${c.category}.${c.fromTier}`);
    } else if (c.action === 'added') {
      lines.push(`  - ADD "${c.keyword}" to ${c.category}.${c.toTier}`);
    } else {
      lines.push(`  - MOVE "${c.keyword}" in ${c.category}: ${c.fromTier} → ${c.toTier}`);
    }
  }
  return lines.join('\n');
}

// --- File I/O ---

/** Load aggregate recommendations from JSON file. */
export function loadRecommendations(filePath: string): AggregateReport {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as AggregateReport;
}

/** Main entry: apply recommendations to assessment-rules.ts. */
export async function applyDecisions(options?: {
  recommendationsPath?: string;
  dryRun?: boolean;
}): Promise<AppliedChange[]> {
  const recsPath =
    options?.recommendationsPath ??
    path.resolve(__dirname, 'reports', 'aggregate-recommendations.json');

  if (!fs.existsSync(recsPath)) {
    throw new Error(`Recommendations file not found: ${recsPath}. Run --aggregate first.`);
  }

  const report = loadRecommendations(recsPath);
  console.log(
    `[seed:apply] Loaded ${report.keywordRecommendations.length} keyword recommendations`,
  );

  if (report.keywordRecommendations.length === 0) {
    console.log('[seed:apply] No keyword recommendations to apply.');
    return [];
  }

  // Deep clone current rules
  const { ASSESSMENT_RULES } = await import('@/lib/data/assessment-rules');
  const rules: AssessmentRules = JSON.parse(JSON.stringify(ASSESSMENT_RULES));

  const changes = applyAllRecommendations(rules, report.keywordRecommendations);

  console.log(formatChangePreview(changes));

  if (changes.length === 0) {
    console.log('[seed:apply] No applicable changes found.');
    return [];
  }

  if (options?.dryRun) {
    console.log('[seed:apply] Dry run — no files modified.');
    return changes;
  }

  const rulesPath = path.resolve(__dirname, '..', 'data', 'assessment-rules.ts');
  const source = serializeRules(rules);
  fs.writeFileSync(rulesPath, source);
  console.log(`[seed:apply] Wrote updated rules → ${rulesPath}`);
  console.log('[seed:apply] Run `npx prettier --write` on the file before committing.');

  return changes;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const recsIdx = args.indexOf('--recommendations');
  const recommendationsPath = recsIdx >= 0 ? args[recsIdx + 1] : undefined;

  applyDecisions({ dryRun, recommendationsPath })
    .then((changes) => {
      console.log(`[seed:apply] Done. ${changes.length} change(s) applied.`);
      process.exit(0);
    })
    .catch((err) => {
      console.error('[seed:apply] Fatal error:', err);
      process.exit(1);
    });
}
