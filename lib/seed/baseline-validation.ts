/**
 * Cross-baseline validation report.
 *
 * Compares flagging rates, severity distributions, and document volumes
 * across multiple baselines. Surfaces source asymmetry warnings and
 * empirically tests the cycle-year hypothesis (Year 1 vs Year 2).
 *
 * Pure functions are exported for testing. DB access is isolated in
 * runValidation().
 *
 * Usage:
 *   pnpm seed:validate                  # Compare all baselines
 *   pnpm seed:validate --out ./my-dir   # Custom output directory
 */

import fs from 'fs';
import path from 'path';
import type { BaselineConfig, BaselineSource } from '@/lib/data/baselines';
import { BASELINE_CONFIGS } from '@/lib/data/baselines';

// --- Types ---

export interface BaselineStats {
  baselineId: string;
  label: string;
  cycleYear: number;
  administration: string;
  availableSources: BaselineSource[];
  sourceNotes?: string;
  categories: CategoryStats[];
}

export interface CategoryStats {
  category: string;
  avgWeeklySeverity: number;
  stddevWeeklySeverity: number;
  avgWeeklyDocCount: number;
  weekCount: number;
  alertCount: number;
}

export interface CategoryComparison {
  category: string;
  baselines: Array<{
    baselineId: string;
    cycleYear: number;
    avgSeverity: number;
    avgDocCount: number;
    alertCount: number;
  }>;
  severityRatio: number | null; // Year 1 / Year 2 (null if no Year 2)
  volumeRatio: number | null;
  sourceAsymmetry: boolean;
}

export interface ValidationReport {
  generatedAt: string;
  baselineCount: number;
  baselines: BaselineStats[];
  comparisons: CategoryComparison[];
  sourceAsymmetryWarnings: string[];
  cycleYearFindings: string[];
}

// --- Pure functions ---

/** Identify source coverage differences across baselines. */
export function detectSourceAsymmetry(baselines: BaselineConfig[]): string[] {
  const warnings: string[] = [];
  const sourceSets = baselines.map((b) => ({
    id: b.id,
    sources: new Set(b.availableSources),
    notes: b.sourceNotes,
  }));

  const allSources = new Set(baselines.flatMap((b) => b.availableSources));

  for (const source of allSources) {
    const have = sourceSets.filter((s) => s.sources.has(source)).map((s) => s.id);
    const missing = sourceSets.filter((s) => !s.sources.has(source)).map((s) => s.id);

    if (missing.length > 0) {
      const note = sourceSets.find((s) => !s.sources.has(source))?.notes;
      const reason = note ? ` (${note})` : '';
      warnings.push(
        `${source}: available in [${have.join(', ')}], missing from [${missing.join(', ')}]${reason}`,
      );
    }
  }

  return warnings;
}

/** Compare a single category across all baselines. */
export function compareCategoryAcrossBaselines(
  category: string,
  baselineStats: BaselineStats[],
): CategoryComparison {
  const entries = baselineStats
    .map((b) => {
      const cat = b.categories.find((c) => c.category === category);
      return cat
        ? {
            baselineId: b.baselineId,
            cycleYear: b.cycleYear,
            avgSeverity: cat.avgWeeklySeverity,
            avgDocCount: cat.avgWeeklyDocCount,
            alertCount: cat.alertCount,
          }
        : null;
    })
    .filter(Boolean) as CategoryComparison['baselines'];

  const year1 = entries.filter((e) => e.cycleYear === 1);
  const year2 = entries.filter((e) => e.cycleYear === 2);

  const avgYear1Severity = year1.length > 0 ? mean(year1.map((e) => e.avgSeverity)) : null;
  const avgYear2Severity = year2.length > 0 ? mean(year2.map((e) => e.avgSeverity)) : null;
  const avgYear1Volume = year1.length > 0 ? mean(year1.map((e) => e.avgDocCount)) : null;
  const avgYear2Volume = year2.length > 0 ? mean(year2.map((e) => e.avgDocCount)) : null;

  const severityRatio =
    avgYear1Severity !== null && avgYear2Severity !== null && avgYear2Severity > 0
      ? avgYear1Severity / avgYear2Severity
      : null;

  const volumeRatio =
    avgYear1Volume !== null && avgYear2Volume !== null && avgYear2Volume > 0
      ? avgYear1Volume / avgYear2Volume
      : null;

  // Source asymmetry exists if baselines have different source sets
  const sourceSets = baselineStats.map((b) => b.availableSources.sort().join(','));
  const sourceAsymmetry = new Set(sourceSets).size > 1;

  return { category, baselines: entries, severityRatio, volumeRatio, sourceAsymmetry };
}

/** Summarize cycle-year findings from all comparisons. */
export function summarizeCycleFindings(comparisons: CategoryComparison[]): string[] {
  const findings: string[] = [];

  const withRatios = comparisons.filter((c) => c.severityRatio !== null);
  if (withRatios.length === 0) {
    findings.push('No Year 1 vs Year 2 comparison possible (missing data for one cycle year).');
    return findings;
  }

  const highSeverity = withRatios.filter((c) => c.severityRatio! > 1.5);
  const highVolume = withRatios.filter((c) => c.volumeRatio !== null && c.volumeRatio > 1.5);
  const lowSeverity = withRatios.filter((c) => c.severityRatio! < 0.75);

  if (highSeverity.length > 0) {
    findings.push(
      `Year 1 shows >1.5x severity in ${highSeverity.length} categories: ` +
        `${highSeverity.map((c) => `${c.category} (${c.severityRatio!.toFixed(1)}x)`).join(', ')}. ` +
        'These categories may benefit from cycle-aware volume thresholds.',
    );
  }

  if (highVolume.length > 0) {
    findings.push(
      `Year 1 shows >1.5x document volume in ${highVolume.length} categories: ` +
        `${highVolume.map((c) => `${c.category} (${c.volumeRatio!.toFixed(1)}x)`).join(', ')}.`,
    );
  }

  if (lowSeverity.length > 0) {
    findings.push(
      `Year 1 shows <0.75x severity in ${lowSeverity.length} categories: ` +
        `${lowSeverity.map((c) => `${c.category} (${c.severityRatio!.toFixed(1)}x)`).join(', ')}. ` +
        'These categories may be less active during transitions.',
    );
  }

  const asymmetric = withRatios.filter((c) => c.sourceAsymmetry);
  if (asymmetric.length > 0) {
    findings.push(
      `Source asymmetry warning: ${asymmetric.length} comparisons involve baselines ` +
        'with different source coverage. Severity/volume ratios may reflect source ' +
        'differences rather than true cycle effects.',
    );
  }

  if (highSeverity.length === 0 && highVolume.length === 0 && lowSeverity.length === 0) {
    findings.push(
      'Cycle effects are small across all categories. Year 1 and Year 2 baselines ' +
        'show similar severity and volume distributions. Cycle adjustment factors ' +
        'may not be necessary.',
    );
  }

  return findings;
}

/** Build the full validation report from baseline stats. */
export function buildValidationReport(baselineStats: BaselineStats[]): ValidationReport {
  const allCategories = [
    ...new Set(baselineStats.flatMap((b) => b.categories.map((c) => c.category))),
  ];

  const comparisons = allCategories
    .map((cat) => compareCategoryAcrossBaselines(cat, baselineStats))
    .sort((a, b) => {
      const aRatio = a.severityRatio ?? 0;
      const bRatio = b.severityRatio ?? 0;
      return Math.abs(bRatio - 1) - Math.abs(aRatio - 1); // Most divergent first
    });

  const configs = baselineStats.map(
    (b) =>
      BASELINE_CONFIGS.find((c) => c.id === b.baselineId) ?? {
        id: b.baselineId,
        availableSources: b.availableSources,
        sourceNotes: b.sourceNotes,
      },
  ) as BaselineConfig[];

  return {
    generatedAt: new Date().toISOString(),
    baselineCount: baselineStats.length,
    baselines: baselineStats,
    comparisons,
    sourceAsymmetryWarnings: detectSourceAsymmetry(configs),
    cycleYearFindings: summarizeCycleFindings(comparisons),
  };
}

/** Format the validation report as Markdown. */
export function formatValidationMarkdown(report: ValidationReport): string {
  const lines: string[] = [
    '# Cross-Baseline Validation Report',
    '',
    `Generated: ${report.generatedAt}`,
    `Baselines compared: ${report.baselineCount}`,
    '',
  ];

  // Baseline overview
  lines.push('## Baseline Overview', '');
  lines.push('| Baseline | Cycle Year | Admin | Sources | Categories |');
  lines.push('|----------|-----------|-------|---------|------------|');
  for (const b of report.baselines) {
    lines.push(
      `| ${b.label} | Year ${b.cycleYear} | ${b.administration} | ${b.availableSources.join(', ')} | ${b.categories.length} |`,
    );
  }
  lines.push('');

  // Source asymmetry warnings
  if (report.sourceAsymmetryWarnings.length > 0) {
    lines.push('## Source Asymmetry Warnings', '');
    for (const w of report.sourceAsymmetryWarnings) {
      lines.push(`- ${w}`);
    }
    lines.push('');
  }

  // Category comparison table
  lines.push('## Category Comparison', '');
  lines.push(
    '| Category | ' +
      report.baselines.map((b) => `${b.label} Sev`).join(' | ') +
      ' | ' +
      report.baselines.map((b) => `${b.label} Vol`).join(' | ') +
      ' | Sev Ratio (Y1/Y2) | Vol Ratio (Y1/Y2) | Source Asymmetry |',
  );
  lines.push(
    '|----------|' +
      report.baselines.map(() => '---').join('|') +
      '|' +
      report.baselines.map(() => '---').join('|') +
      '|---|---|---|',
  );

  for (const comp of report.comparisons) {
    const sevCells = report.baselines.map((b) => {
      const entry = comp.baselines.find((e) => e.baselineId === b.baselineId);
      return entry ? entry.avgSeverity.toFixed(2) : 'N/A';
    });
    const volCells = report.baselines.map((b) => {
      const entry = comp.baselines.find((e) => e.baselineId === b.baselineId);
      return entry ? entry.avgDocCount.toFixed(1) : 'N/A';
    });
    const sevRatio = comp.severityRatio !== null ? `${comp.severityRatio.toFixed(2)}x` : 'N/A';
    const volRatio = comp.volumeRatio !== null ? `${comp.volumeRatio.toFixed(2)}x` : 'N/A';
    const asymmetry = comp.sourceAsymmetry ? 'Yes' : 'No';

    lines.push(
      `| ${comp.category} | ${sevCells.join(' | ')} | ${volCells.join(' | ')} | ${sevRatio} | ${volRatio} | ${asymmetry} |`,
    );
  }
  lines.push('');

  // Cycle-year findings
  lines.push('## Cycle-Year Findings', '');
  for (const finding of report.cycleYearFindings) {
    lines.push(`- ${finding}`);
  }
  lines.push('');

  return lines.join('\n');
}

// --- Helpers ---

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

// --- DB + I/O ---

function rowsToCountMap(rows: { category: string; cnt: string }[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    map.set(row.category, parseInt(row.cnt, 10));
  }
  return map;
}

async function loadConfigStats(
  db: ReturnType<Awaited<typeof import('@/lib/db')>['getDb']>,
  sqlTag: typeof import('drizzle-orm').sql,
  config: (typeof BASELINE_CONFIGS)[number],
): Promise<BaselineStats | null> {
  const rows = await db.execute(sqlTag`
    SELECT category, avg_weekly_severity, stddev_weekly_severity, avg_weekly_doc_count
    FROM baselines WHERE baseline_id = ${config.id}
  `);
  if (rows.rows.length === 0) return null;

  const alertRows = await db.execute(sqlTag`
    SELECT category, COUNT(*) as cnt FROM alerts
    WHERE created_at >= ${config.from}::date AND created_at <= ${config.to}::date
      AND type = 'review' GROUP BY category
  `);
  const weekRows = await db.execute(sqlTag`
    SELECT category, COUNT(*) as cnt FROM weekly_aggregates
    WHERE week_of >= ${config.from} AND week_of <= ${config.to} GROUP BY category
  `);

  const alertsByCategory = rowsToCountMap(alertRows.rows as { category: string; cnt: string }[]);
  const weeksByCategory = rowsToCountMap(weekRows.rows as { category: string; cnt: string }[]);

  type BaselineRow = {
    category: string;
    avg_weekly_severity: number;
    stddev_weekly_severity: number;
    avg_weekly_doc_count: number;
  };
  const categories: CategoryStats[] = (rows.rows as BaselineRow[]).map((row) => ({
    category: row.category,
    avgWeeklySeverity: row.avg_weekly_severity,
    stddevWeeklySeverity: row.stddev_weekly_severity,
    avgWeeklyDocCount: row.avg_weekly_doc_count,
    weekCount: weeksByCategory.get(row.category) ?? 0,
    alertCount: alertsByCategory.get(row.category) ?? 0,
  }));

  return {
    baselineId: config.id,
    label: config.label,
    cycleYear: config.cycleYear,
    administration: config.administration,
    availableSources: config.availableSources,
    sourceNotes: config.sourceNotes,
    categories,
  };
}

async function loadBaselineStats(): Promise<BaselineStats[]> {
  const { sql: sqlTag } = await import('drizzle-orm');
  const { getDb } = await import('@/lib/db');
  const db = getDb();

  const stats: BaselineStats[] = [];
  for (const config of BASELINE_CONFIGS) {
    const result = await loadConfigStats(db, sqlTag, config);
    if (result) {
      stats.push(result);
    } else {
      console.log(`[validate] Skipping ${config.id} — no baseline data`);
    }
  }
  return stats;
}

export async function runValidation(options?: { outDir?: string }): Promise<ValidationReport> {
  const { isDbAvailable } = await import('@/lib/db');

  if (!isDbAvailable()) {
    throw new Error('DATABASE_URL not configured');
  }

  const stats = await loadBaselineStats();

  if (stats.length < 2) {
    console.log(`[validate] Only ${stats.length} baseline(s) available. Need ≥2 for comparison.`);
  }

  const report = buildValidationReport(stats);

  const outDir = options?.outDir ?? path.resolve(__dirname, 'reports');
  fs.mkdirSync(outDir, { recursive: true });

  const jsonPath = path.join(outDir, 'baseline-validation.json');
  fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2));
  console.log(`[validate] JSON → ${jsonPath}`);

  const mdPath = path.join(outDir, 'baseline-validation.md');
  fs.writeFileSync(mdPath, formatValidationMarkdown(report));
  console.log(`[validate] Markdown → ${mdPath}`);

  console.log(
    `[validate] Compared ${report.baselineCount} baselines across ${report.comparisons.length} categories`,
  );
  if (report.sourceAsymmetryWarnings.length > 0) {
    console.log(`[validate] ${report.sourceAsymmetryWarnings.length} source asymmetry warnings`);
  }
  for (const finding of report.cycleYearFindings) {
    console.log(`[validate] ${finding}`);
  }

  return report;
}

// --- CLI entry ---

function parseCliArgs(args: string[]): { outDir?: string } {
  const opts: { outDir?: string } = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') opts.outDir = args[++i];
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());

  const opts = parseCliArgs(process.argv.slice(2));

  runValidation(opts)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[validate] Fatal error:', err);
      process.exit(1);
    });
}
