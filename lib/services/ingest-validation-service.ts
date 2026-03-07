/**
 * Ingest validation service — "Did we get the data we expected?"
 *
 * Checks source coverage, content completeness, pagination fitness,
 * FR/GDELT period coverage, and CourtListener opinion coverage.
 *
 * Source-specific queries: ingest-validation-queries.ts
 */

import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable } from '@/lib/db';
import type { Category } from '@/lib/types';
import { getIncompleteWeeks } from './fetch-log-store';
import {
  getDocumentCoverage,
  getContentCompleteness,
  getContentCompletenessByOrigin,
  getPaginationFitness,
  getFrPeriodCoverage,
  getCpdPeriodCoverage,
  getGdeltCrossfeedCoverage,
  getClOpinionCoverage,
  getSourcePeriodCoverage,
  getSourceCoverageByCategory,
  checkSignalCoverage,
} from './ingest-validation-queries';
import type {
  SourcePeriodGap,
  SignalCoverageRow,
  SignalCoverageGap,
} from './ingest-validation-queries';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentCoverage {
  category: string;
  sourceOrigin: string;
  count: number;
}

export interface ContentCompleteness {
  sourceType: string;
  total: number;
  nullContent: number;
}

export interface PaginationFitness {
  category: string;
  sourceOrigin: string;
  peakWeeklyCount: number;
}

export interface SourcePeriodCoverage {
  category: string;
  sourceOrigin: string;
  period: string;
  count: number;
}

export interface ClOpinionCoverage {
  docketEntries: number;
  opinionDocuments: number;
  uniqueCases: number;
  casesWithOpinion: number;
  casesWithoutOpinion: number;
}

export interface FetchErrorSummary {
  sourceOrigin: string;
  totalIncomplete: number;
  categories: number;
  totalErrors: number;
}

export interface IngestReport {
  documentCoverage: DocumentCoverage[];
  contentCompleteness: ContentCompleteness[];
  contentCompletenessByOrigin: ContentCompleteness[];
  paginationFitness: PaginationFitness[];
  frPeriodCoverage: SourcePeriodCoverage[];
  cpdPeriodCoverage: SourcePeriodCoverage[];
  gdeltCrossfeedCoverage: SourcePeriodCoverage[];
  sourcePeriodCoverage: SourcePeriodGap[];
  clOpinionCoverage: ClOpinionCoverage | null;
  signalCoverageGaps: SignalCoverageGap[];
  fetchErrors: FetchErrorSummary[];
  warnings: string[];
}

/** Source types where content can be backfilled via `pnpm backfill:content`. */
export const CONTENT_FIXABLE_TYPES = new Set(['Presidential Document', 'congressional_report']);

/** Source origins where content can be backfilled via `pnpm backfill:content`. */
export const CONTENT_FIXABLE_ORIGINS = new Map<string, string>();

// Re-export query functions and types for consumers
export type { SourcePeriodGap, SignalCoverageRow, SignalCoverageGap };
export {
  getDocumentCoverage,
  getContentCompleteness,
  getContentCompletenessByOrigin,
  getPaginationFitness,
  getFrPeriodCoverage,
  getCpdPeriodCoverage,
  getGdeltCrossfeedCoverage,
  getClOpinionCoverage,
  getSourcePeriodCoverage,
  getSourceCoverageByCategory,
  checkSignalCoverage,
};

// ---------------------------------------------------------------------------
// Warning collection
// ---------------------------------------------------------------------------

const EXPECTED_PERIODS = ['biden_2022', 'biden_2021', 'trump_2017', 'trump_2018', 'trump_t2'];
const CL_PAGINATION_CAP = 900;
const THIN_CATEGORY_THRESHOLD = 500;

function checkFrCoverage(frCoverage: SourcePeriodCoverage[], cats: Category[]): string[] {
  const warnings: string[] = [];
  const frByCat = new Map<string, Set<string>>();
  for (const row of frCoverage) {
    if (!frByCat.has(row.category)) frByCat.set(row.category, new Set());
    frByCat.get(row.category)!.add(row.period);
  }
  for (const cat of cats) {
    const periods = frByCat.get(cat.key);
    if (!periods) {
      warnings.push(`${cat.key} has no FR documents in any period`);
      continue;
    }
    const missing = EXPECTED_PERIODS.filter((p) => !periods.has(p));
    if (missing.length > 0) {
      warnings.push(`${cat.key} missing FR documents in: ${missing.join(', ')}`);
    }
  }
  return warnings;
}

/** Expected start dates for each analysis period. */
const PERIOD_START_DATES: Record<string, string> = {
  trump_2017: '2017-01-20',
  trump_2018: '2018-01-20',
  biden_2021: '2021-01-20',
  biden_2022: '2022-01-20',
  trump_t2: '2025-01-20',
};

/** Days after period start before a source is considered "late". */
const LATE_START_DAYS = 30;

function checkSourcePeriodGaps(coverage: SourcePeriodGap[]): string[] {
  const warnings: string[] = [];

  // Build map: source -> { period -> { count, earliest } }
  const bySource = new Map<string, Map<string, { count: number; earliest: string | null }>>();
  for (const row of coverage) {
    if (row.period === 'other') continue;
    if (!bySource.has(row.sourceOrigin)) bySource.set(row.sourceOrigin, new Map());
    bySource.get(row.sourceOrigin)!.set(row.period, {
      count: row.count,
      earliest: row.earliestDate,
    });
  }

  for (const [source, periods] of bySource) {
    const hasAnyBaseline = EXPECTED_PERIODS.some(
      (p) => p !== 'trump_t2' && (periods.get(p)?.count ?? 0) > 0,
    );
    const t2 = periods.get('trump_t2');

    // Source in baselines but missing from T2
    if (hasAnyBaseline && (!t2 || t2.count === 0)) {
      warnings.push(`${source}: present in baselines but missing from T2`);
    }

    // Source in T2 but started late (>30 days after inauguration)
    if (t2 && t2.count > 0 && t2.earliest) {
      const periodStart = new Date(PERIOD_START_DATES.trump_t2);
      const earliest = new Date(t2.earliest);
      const daysDiff = Math.round(
        (earliest.getTime() - periodStart.getTime()) / (1000 * 60 * 60 * 24),
      );
      if (daysDiff > LATE_START_DAYS) {
        warnings.push(
          `${source}: T2 data starts ${t2.earliest} (${daysDiff} days after inauguration)`,
        );
      }
    }

    // Large volume asymmetry across periods (baseline vs baseline)
    const baselinePeriods = ['biden_2022', 'biden_2021', 'trump_2017', 'trump_2018'];
    const baselineCounts = baselinePeriods
      .map((p) => periods.get(p)?.count ?? 0)
      .filter((c) => c > 0);
    if (baselineCounts.length >= 2) {
      const max = Math.max(...baselineCounts);
      const min = Math.min(...baselineCounts);
      if (max > 10 * min && min > 0) {
        warnings.push(`${source}: >10x volume asymmetry across baselines (${min}–${max})`);
      }
    }
  }

  return warnings;
}

export function collectWarnings(report: IngestReport, categoryFilter?: string): string[] {
  const warnings: string[] = [];
  const cats = categoryFilter ? CATEGORIES.filter((c) => c.key === categoryFilter) : CATEGORIES;

  for (const cc of report.contentCompleteness) {
    if (CONTENT_FIXABLE_TYPES.has(cc.sourceType)) {
      const source = cc.sourceType === 'Presidential Document' ? 'fr' : 'govinfo';
      warnings.push(
        `${cc.nullContent} ${cc.sourceType} docs have null content (run: pnpm backfill:content --source ${source})`,
      );
    }
  }

  for (const cc of report.contentCompletenessByOrigin) {
    const source = CONTENT_FIXABLE_ORIGINS.get(cc.sourceType);
    if (source) {
      warnings.push(
        `${cc.nullContent} ${cc.sourceType} docs have null content (run: pnpm backfill:content --source ${source})`,
      );
    }
  }

  for (const pf of report.paginationFitness) {
    if (pf.peakWeeklyCount >= CL_PAGINATION_CAP) {
      warnings.push(
        `${pf.category} CourtListener peak=${pf.peakWeeklyCount} hits pagination cap ${CL_PAGINATION_CAP}`,
      );
    }
  }

  warnings.push(...checkFrCoverage(report.frPeriodCoverage, cats));

  const gdeltCats = new Set(report.gdeltCrossfeedCoverage.map((r) => r.category));
  const docsByCat = new Map<string, number>();
  for (const row of report.documentCoverage) {
    docsByCat.set(row.category, (docsByCat.get(row.category) ?? 0) + row.count);
  }
  const missingGdelt = cats
    .filter((c) => !gdeltCats.has(c.key) && (docsByCat.get(c.key) ?? 0) >= THIN_CATEGORY_THRESHOLD)
    .map((c) => c.key);
  if (missingGdelt.length > 0) {
    warnings.push(`Categories missing GDELT cross-feed: ${missingGdelt.join(', ')}`);
  }

  warnings.push(...checkSourcePeriodGaps(report.sourcePeriodCoverage));

  // Signal definition coverage gaps
  for (const gap of report.signalCoverageGaps) {
    const label = gap.origin === 'signal' ? 'signal-defined' : 'pipeline-routed';
    warnings.push(`${gap.category} missing ${label} source: ${gap.expectedSource}`);
  }

  // Fetch errors
  for (const fe of report.fetchErrors) {
    warnings.push(
      `${fe.sourceOrigin}: ${fe.totalIncomplete} incomplete fetch(es) across ${fe.categories} category(ies) (run: pnpm backfill:gaps --source ${fe.sourceOrigin})`,
    );
  }

  return warnings;
}

// ---------------------------------------------------------------------------
// Fetch error summarization
// ---------------------------------------------------------------------------

interface IncompleteWeekRow {
  sourceOrigin: string;
  category: string;
  errors: string[] | null;
}

function summarizeFetchErrors(incompleteWeeks: IncompleteWeekRow[]): FetchErrorSummary[] {
  const bySource = new Map<string, { categories: Set<string>; errors: number; count: number }>();
  for (const w of incompleteWeeks) {
    if (!bySource.has(w.sourceOrigin))
      bySource.set(w.sourceOrigin, { categories: new Set(), errors: 0, count: 0 });
    const entry = bySource.get(w.sourceOrigin)!;
    entry.categories.add(w.category);
    entry.errors += w.errors?.length ?? 0;
    entry.count++;
  }
  return [...bySource.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, data]) => ({
      sourceOrigin: source,
      totalIncomplete: data.count,
      categories: data.categories.size,
      totalErrors: data.errors,
    }));
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

export async function runIngestValidation(category?: string): Promise<IngestReport> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');

  const [
    coverage,
    content,
    contentByOrigin,
    pagination,
    frPeriod,
    cpdPeriod,
    gdeltCrossfeed,
    sourcePeriod,
    clOpinions,
    sourceCoverage,
    incompleteWeeks,
  ] = await Promise.all([
    getDocumentCoverage(category),
    getContentCompleteness(category),
    getContentCompletenessByOrigin(category),
    getPaginationFitness(category),
    getFrPeriodCoverage(category),
    getCpdPeriodCoverage(category),
    getGdeltCrossfeedCoverage(category),
    getSourcePeriodCoverage(),
    getClOpinionCoverage(),
    getSourceCoverageByCategory(),
    getIncompleteWeeks(),
  ]);

  const cats = category ? CATEGORIES.filter((c) => c.key === category) : CATEGORIES;
  const signalCoverageGaps = checkSignalCoverage(sourceCoverage, cats);
  const fetchErrors = summarizeFetchErrors(incompleteWeeks);

  const report: IngestReport = {
    documentCoverage: coverage,
    contentCompleteness: content,
    contentCompletenessByOrigin: contentByOrigin,
    paginationFitness: pagination,
    frPeriodCoverage: frPeriod,
    cpdPeriodCoverage: cpdPeriod,
    gdeltCrossfeedCoverage: gdeltCrossfeed,
    sourcePeriodCoverage: sourcePeriod,
    clOpinionCoverage: clOpinions,
    signalCoverageGaps,
    fetchErrors,
    warnings: [],
  };
  report.warnings = collectWarnings(report, category);

  return report;
}
