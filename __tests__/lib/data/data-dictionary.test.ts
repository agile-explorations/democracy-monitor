import { getTableColumns } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { DATA_DICTIONARY } from '@/lib/data/data-dictionary';
import {
  aiDocumentAssessments,
  baselines,
  documents,
  documentScores,
  narratives,
  weeklyAggregates,
} from '@/lib/db/schema';
import { flattenScoresRow, flattenWeeklyRow } from '@/lib/utils/csv-flatten';

/**
 * Two-directional sync guard (#591): every column an artifact actually
 * exposes has a dictionary entry, and every entry names a real column.
 * Failing here blocks the pre-push hook — the dictionary cannot drift into
 * production. Columns that exist only in the database (managed outside the
 * Drizzle schema) are declared explicitly.
 */

const DB_ONLY_COLUMNS: Record<string, string[]> = {
  table_documents: ['search_vector'],
};

const TABLES = {
  table_documents: documents,
  table_document_scores: documentScores,
  table_weekly_aggregates: weeklyAggregates,
  table_ai_document_assessments: aiDocumentAssessments,
  table_baselines: baselines,
  table_narratives: narratives,
} as const;

function dictNames(key: string): string[] {
  const artifact = DATA_DICTIONARY.find((a) => a.key === key);
  expect(artifact, `artifact ${key} present in dictionary`).toBeDefined();
  return artifact!.entries.map((e) => e.name);
}

function expectSameSet(actual: string[], documented: string[], label: string) {
  const missing = actual.filter((c) => !documented.includes(c));
  const orphaned = documented.filter((c) => !actual.includes(c));
  expect(missing, `${label}: columns missing from the dictionary`).toEqual([]);
  expect(orphaned, `${label}: dictionary entries for nonexistent columns`).toEqual([]);
  expect(new Set(documented).size, `${label}: duplicate dictionary entries`).toBe(
    documented.length,
  );
}

describe('data dictionary sync (#591)', () => {
  it('covers exactly the weekly CSV columns the flattener emits', () => {
    const emitted = Object.keys(
      flattenWeeklyRow({
        category: 'x',
        weekOf: '2025-01-20',
        documentCount: 0,
        totalSeverity: 0,
        structuralDetail: {},
        aiDetail: {},
        thematicDetail: {},
        convergenceDetail: {},
      } as never),
    );
    expectSameSet(emitted, dictNames('csv_weekly'), 'csv_weekly');
  });

  it('covers exactly the scores CSV columns the flattener emits', () => {
    const emitted = Object.keys(flattenScoresRow({ matches: [], suppressed: [] } as never, false));
    expectSameSet(emitted, dictNames('csv_scores'), 'csv_scores');
  });

  for (const [key, table] of Object.entries(TABLES)) {
    it(`covers exactly the ${key.replace('table_', '')} schema columns`, () => {
      const schemaCols = Object.values(getTableColumns(table)).map((c) => c.name);
      const actual = [...schemaCols, ...(DB_ONLY_COLUMNS[key] ?? [])];
      expectSameSet(actual, dictNames(key), key);
    });
  }

  it('every entry has a non-trivial description and a type', () => {
    for (const artifact of DATA_DICTIONARY) {
      for (const entry of artifact.entries) {
        expect(entry.type.length, `${artifact.key}.${entry.name} type`).toBeGreaterThan(0);
        expect(
          entry.description.length,
          `${artifact.key}.${entry.name} description too short`,
        ).toBeGreaterThan(30);
      }
    }
  });
});
