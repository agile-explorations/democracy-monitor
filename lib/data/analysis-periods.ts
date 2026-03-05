/**
 * Single source of truth for which date ranges the pipeline should process by default.
 * Combines the four baseline periods from BASELINE_CONFIGS with the T2 monitoring period.
 *
 * Every pipeline command should restrict to these periods unless --all-dates is passed.
 */
import type { SQL } from 'drizzle-orm';
import { or, and, gte, lte } from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import { toDateString } from '@/lib/utils/date-utils';
import { BASELINE_CONFIGS } from './baselines';

const T2_INAUGURATION = '2025-01-20';

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
