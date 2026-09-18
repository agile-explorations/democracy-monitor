/**
 * Pass-1 flag-rate denominators exclude the `corpus` pseudo-category (#907).
 *
 * The three rate queries feed the negative controls (NC-1, NC-4, NC-6). A
 * row fixture returned by the mocked db cannot prove a SQL predicate — the
 * mock returns whatever it is told regardless of the WHERE clause — so the
 * proof here is the rendered query text: the predicate the function sends
 * to the database.
 */
import type { SQL } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sqlText as text } from '@/__tests__/helpers/sql-text';
import { CORPUS_CATEGORY } from '@/lib/db/document-filters';
import {
  fetchP1FlagRates,
  fetchT2RoutineRate,
  fetchWeekP1FlagRate,
} from '@/lib/services/event-validation-queries';

const recorded: SQL[] = [];
let rowsToReturn: Record<string, unknown>[] = [];

vi.mock('@/lib/db', () => ({
  getDb: () => ({
    execute: async (query: SQL) => {
      recorded.push(query);
      return { rows: rowsToReturn };
    },
  }),
  isDbAvailable: () => true,
}));

/** Render a drizzle SQL chunk to its parameter-inlined text for assertions
 *  (same helper as __tests__/lib/db/document-filters.test.ts). */

/**
 * The values drizzle would bind as parameters, in order of appearance. The
 * sql`` template keeps interpolated values raw between StringChunks (whose
 * `.value` is the template text array) and only wraps them at build time,
 * so anything that is neither template text nor a nested SQL is a parameter.
 */
function boundParams(chunk: unknown): unknown[] {
  const out: unknown[] = [];
  const walk = (c: unknown): void => {
    const anyC = c as { queryChunks?: unknown[]; value?: unknown };
    if (Array.isArray(anyC?.queryChunks)) anyC.queryChunks.forEach(walk);
    else if (!Array.isArray(anyC?.value)) out.push(c);
  };
  (chunk as { queryChunks: unknown[] }).queryChunks.forEach(walk);
  return out;
}

const CORPUS_EXCLUSION = `d.category <> ${CORPUS_CATEGORY}`;
const INTENT_EXCLUSION = "d.category != 'intent'";

function lastQuery(): SQL {
  const query = recorded[recorded.length - 1];
  if (!query) throw new Error('no query was executed');
  return query;
}

function expectNarrowCorpusExclusion(query: SQL): void {
  const rendered = text(query);
  expect(rendered).toContain(CORPUS_EXCLUSION);
  expect(rendered).toContain(INTENT_EXCLUSION);
  // The corpus name travels as a bound parameter, not an inlined literal.
  expect(boundParams(query)).toContain(CORPUS_CATEGORY);
  // Narrow exclusion only: retrieval_relevant = false rows stay in the
  // denominator because the NC baselines were computed over them.
  expect(rendered).not.toContain('retrieval_relevant');
}

beforeEach(() => {
  recorded.length = 0;
  rowsToReturn = [];
});

describe('fetchP1FlagRates (#907)', () => {
  it('excludes corpus rows from the per-category denominator', async () => {
    rowsToReturn = [
      { category: 'mediaFreedom', total_docs: 200, flagged: 20 },
      { category: 'corpus', total_docs: 500, flagged: 0 },
    ];
    const rates = await fetchP1FlagRates('2025-01-20', '2025-01-27');

    expectNarrowCorpusExclusion(lastQuery());
    expect(rates).toEqual([
      { category: 'mediaFreedom', flagRate: 0.1, totalDocs: 200 },
      { category: 'corpus', flagRate: 0, totalDocs: 500 },
    ]);
  });

  it('keeps the corpus exclusion when a category filter is applied', async () => {
    await fetchP1FlagRates('2025-01-20', '2025-01-27', 'mediaFreedom');
    const query = lastQuery();
    expectNarrowCorpusExclusion(query);
    expect(text(query)).toContain('d.category = mediaFreedom');
  });
});

describe('fetchT2RoutineRate (#907)', () => {
  it('excludes corpus rows from the routine-rate denominator', async () => {
    rowsToReturn = [{ total_docs: 100, flagged: 8 }];
    const routine = await fetchT2RoutineRate();

    expectNarrowCorpusExclusion(lastQuery());
    expect(routine).toBeCloseTo(0.92);
  });
});

describe('fetchWeekP1FlagRate (#907)', () => {
  it('excludes corpus rows from the weekly flag-rate denominator', async () => {
    rowsToReturn = [{ total_docs: 40, flagged: 4 }];
    const rate = await fetchWeekP1FlagRate('2025-03-03', '2025-03-10');

    expectNarrowCorpusExclusion(lastQuery());
    expect(rate).toBeCloseTo(0.1);
  });
});
