/**
 * Ingest validation service — "Did we get the data we expected?"
 *
 * Checks source coverage, content completeness, pagination fitness,
 * FR period coverage, and CourtListener opinion coverage.
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
  fetchErrors: FetchErrorSummary[];
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
  checkSignalCoverage,
};

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
    sourcePeriodCoverage: sourcePeriod,
    clOpinionCoverage: clOpinions,
    signalCoverageGaps,
    fetchErrors,
    warnings: [],
    warningDetails: [],
  };
  report.warningDetails = collectWarningDetails(report, category);
  report.warnings = report.warningDetails.map((w) => w.text);

  return report;
}
