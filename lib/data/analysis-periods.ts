/**
 * Single source of truth for which date ranges the pipeline should process by default.
 * Combines every baseline period from BASELINE_CONFIGS (eight as of 2026-07: four core
 * baselines plus trump_2019/2020 and biden_2023/2024) with the T2 monitoring period.
 *
 * Every pipeline command should restrict to these periods unless --all-dates is passed.
 */
import type { SQL } from 'drizzle-orm';
import { or, and, gte, lte, inArray } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { toDateString } from '@/lib/utils/date-utils';
import { BASELINE_CONFIGS } from './baselines';

export const T2_INAUGURATION = '2025-01-20';

export interface AnalysisPeriod {
  from: string;
  to: string;
  label: string;
}

export function getAnalysisPeriods(): AnalysisPeriod[] {
  const periods = BASELINE_CONFIGS.map((b) => ({
    from: b.from,
    to: b.to,
    label: b.id,
  }));
  periods.push({
    from: T2_INAUGURATION,
    to: toDateString(new Date()),
    label: 'trump_t2',
  });
  return periods;
}

export function isInAnalysisPeriod(date: Date | string): boolean {
  const d = typeof date === 'string' ? date : toDateString(date);
  return getAnalysisPeriods().some((p) => d >= p.from && d <= p.to);
}

/**
 * Build a Drizzle SQL condition that restricts a date column to analysis periods.
 * Returns: (col >= p1.from AND col <= p1.to) OR (col >= p2.from AND col <= p2.to) OR ...
 */
export function buildAnalysisPeriodCondition(dateColumn: PgColumn): SQL {
  const periods = getAnalysisPeriods();
  const clauses = periods.map((p) =>
    and(gte(dateColumn, new Date(p.from)), lte(dateColumn, new Date(p.to))),
  );
  return or(...clauses)!;
}

export const ALL_DATES_WARNING =
  '[WARNING] --all-dates: processing ALL documents regardless of analysis period. ' +
  'This includes gap-year data not used in baseline comparisons.';

// ---------------------------------------------------------------------------
// Active source filtering
// ---------------------------------------------------------------------------

/**
 * Source origins included in the active pipeline at launch.
 *
 * Documents from excluded sources (e.g., whitehouse, gdelt) remain in the DB
 * but are filtered out of scoring, aggregation, embedding, and baseline computation.
 * Pass --all-sources to pipeline commands to override this filter.
 */
export const ACTIVE_SOURCES: ReadonlySet<string> = new Set([
  'federal_register',
  'courtlistener',
  'doj',
  'govinfo',
  'fec',
  'govinfo_cpd',
  'legiscan',
  'oig',
  'crec',
  'chrg',
  'dhs_press',
]);

/**
 * Build a Drizzle SQL condition that restricts a source_origin column to active sources.
 * Returns: col IN ('federal_register', 'courtlistener', ...)
 */
export function buildActiveSourceCondition(sourceOriginColumn: PgColumn): SQL {
  return inArray(sourceOriginColumn, [...ACTIVE_SOURCES]);
}

export const ALL_SOURCES_WARNING =
  '[WARNING] --all-sources: processing documents from ALL source origins. ' +
  'This includes excluded sources (whitehouse, gdelt) not used in active pipeline.';
