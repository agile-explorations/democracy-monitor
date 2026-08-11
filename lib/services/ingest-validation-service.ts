/**
 * Ingest validation service — "Did we get the data we expected?"
 *
 * Checks source coverage, content completeness, pagination fitness,
 * FR period coverage, and CourtListener opinion coverage.
 *
 * Source-specific queries: ingest-validation-queries.ts
 */

import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { CATEGORIES } from '@/lib/data/categories';
import { isDbAvailable } from '@/lib/db';
import type { Category } from '@/lib/types';
import { getIncompleteWeeks } from './fetch-log-store';
import {
  countUnfragmentedCrecGranules,
  getDocumentCoverage,
  getContentCompleteness,
  getContentCompletenessByOrigin,
  getPaginationFitness,
  getFrPeriodCoverage,
  getCpdPeriodCoverage,
  getClOpinionCoverage,
  getSourcePeriodCoverage,
  getSourceCoverageByCategory,
  getMetadataOnlyClassification,
  checkSignalCoverage,
} from './ingest-validation-queries';
import type {
  SourcePeriodGap,
  SignalCoverageRow,
  SignalCoverageGap,
} from './ingest-validation-queries';
import { collectWarningDetails } from './ingest-warnings';
import type { IngestWarning } from './ingest-warnings';

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
  earliestWeek: string | null;
  latestWeek: string | null;
  /** True when every incomplete week predates the current term (baseline-only backlog). */
  allBaseline: boolean;
}

/**
 * Whether an acquired population is correctly classified metadata_only (#648:
 * moved here from Data Readiness — it's an acquisition-classification concern,
 * "did we capture the content nature of what we fetched", not a processing backlog).
 */
export interface MetadataOnlyStats {
  population: string;
  sourceFilter: { column: string; value: string };
  /** 'all-marked': every row must be metadata_only. 'none-present': zero rows allowed. */
  mode: 'all-marked' | 'none-present';
  total: number;
  markedMetadataOnly: number;
  unmarked: number;
  pass: boolean;
  /** Remediation command shown when the check fails. */
  hint: string;
}

export interface IngestReport {
  documentCoverage: DocumentCoverage[];
  contentCompleteness: ContentCompleteness[];
  contentCompletenessByOrigin: ContentCompleteness[];
  paginationFitness: PaginationFitness[];
  frPeriodCoverage: SourcePeriodCoverage[];
  cpdPeriodCoverage: SourcePeriodCoverage[];
  sourcePeriodCoverage: SourcePeriodGap[];
  clOpinionCoverage: ClOpinionCoverage | null;
  signalCoverageGaps: SignalCoverageGap[];
  metadataOnlyClassification: MetadataOnlyStats[];
  fetchErrors: FetchErrorSummary[];
  /** Whole-day multi-topic CREC granules without fragment children (#704) —
   *  nonzero means `pnpm crec:build-fragments` needs a re-run. */
  unfragmentedCrecGranules?: number;
  warnings: string[];
  /** Same warnings with severity: 'action' = has a remediation, 'limitation' = documented coverage fact (#feedback 2026-07-25). */
  warningDetails: IngestWarning[];
}

export type { IngestWarning } from './ingest-warnings';

// Re-export query functions and types for consumers
export type { SourcePeriodGap, SignalCoverageRow, SignalCoverageGap };
export {
  getDocumentCoverage,
  getContentCompleteness,
  getContentCompletenessByOrigin,
  getPaginationFitness,
  getFrPeriodCoverage,
  getCpdPeriodCoverage,
  getClOpinionCoverage,
  getSourcePeriodCoverage,
  getSourceCoverageByCategory,
  getMetadataOnlyClassification,
  checkSignalCoverage,
};

// ---------------------------------------------------------------------------
// Fetch error summarization
// ---------------------------------------------------------------------------

interface IncompleteWeekRow {
  sourceOrigin: string;
  category: string;
  weekStart: string;
  errors: string[] | null;
}

function summarizeFetchErrors(incompleteWeeks: IncompleteWeekRow[]): FetchErrorSummary[] {
  const bySource = new Map<
    string,
    { categories: Set<string>; errors: number; count: number; weeks: string[] }
  >();
  for (const w of incompleteWeeks) {
    if (!bySource.has(w.sourceOrigin))
      bySource.set(w.sourceOrigin, { categories: new Set(), errors: 0, count: 0, weeks: [] });
    const entry = bySource.get(w.sourceOrigin)!;
    entry.categories.add(w.category);
    entry.errors += w.errors?.length ?? 0;
    entry.count++;
    entry.weeks.push(String(w.weekStart).slice(0, 10));
  }
  return [...bySource.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([source, data]) => {
      const weeks = data.weeks.sort();
      const latest = weeks[weeks.length - 1] ?? null;
      return {
        sourceOrigin: source,
        totalIncomplete: data.count,
        categories: data.categories.size,
        totalErrors: data.errors,
        earliestWeek: weeks[0] ?? null,
        latestWeek: latest,
        // The Source Fetch Health bar is current-term-scoped; a baseline-only
        // backlog must say so or the two widgets appear to contradict.
        allBaseline: latest !== null && latest < T2_INAUGURATION,
      };
    });
}

// ---------------------------------------------------------------------------
// Orchestrator
// ---------------------------------------------------------------------------

/** Run every report input query concurrently. */
async function fetchReportInputs(category?: string) {
  const [
    coverage,
    content,
    contentByOrigin,
    pagination,
    frPeriod,
    cpdPeriod,
    sourcePeriod,
    clOpinions,
    sourceCoverage,
    incompleteWeeks,
    metadataOnlyClassification,
    unfragmentedCrecGranules,
  ] = await Promise.all([
    getDocumentCoverage(category),
    getContentCompleteness(category),
    getContentCompletenessByOrigin(category),
    getPaginationFitness(category),
    getFrPeriodCoverage(category),
    getCpdPeriodCoverage(category),
    getSourcePeriodCoverage(),
    getClOpinionCoverage(),
    getSourceCoverageByCategory(),
    getIncompleteWeeks(),
    getMetadataOnlyClassification(),
    countUnfragmentedCrecGranules(),
  ]);
  return {
    coverage,
    content,
    contentByOrigin,
    pagination,
    frPeriod,
    cpdPeriod,
    sourcePeriod,
    clOpinions,
    sourceCoverage,
    incompleteWeeks,
    metadataOnlyClassification,
    unfragmentedCrecGranules,
  };
}

export async function runIngestValidation(category?: string): Promise<IngestReport> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');

  const {
    coverage,
    content,
    contentByOrigin,
    pagination,
    frPeriod,
    cpdPeriod,
    sourcePeriod,
    clOpinions,
    sourceCoverage,
    incompleteWeeks,
    metadataOnlyClassification,
    unfragmentedCrecGranules,
  } = await fetchReportInputs(category);

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
    sourcePeriodCoverage: sourcePeriod,
    clOpinionCoverage: clOpinions,
    signalCoverageGaps,
    metadataOnlyClassification,
    fetchErrors,
    unfragmentedCrecGranules,
    warnings: [],
    warningDetails: [],
  };
  report.warningDetails = collectWarningDetails(report, category);
  report.warnings = report.warningDetails.map((w) => w.text);

  return report;
}
