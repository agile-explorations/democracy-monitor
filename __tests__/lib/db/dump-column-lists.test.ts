/**
 * Tripwire (#544): the public dump and db:init restore use HARDCODED
 * documents column lists. If a schema column is added without updating them,
 * dumps silently drop the column and restores fail or lose data (this bit
 * retrieval_relevant during #544). This test fails CI until both lists match
 * the Drizzle schema.
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { getTableColumns } from 'drizzle-orm';
import { describe, it, expect } from 'vitest';
import { documents } from '@/lib/db/schema';

const REPO_ROOT = join(__dirname, '..', '..', '..');

/** documents columns the dump intentionally omits (rebuilt separately —
 *  search_rank_vector is derived and recomputed by its trigger on restore). */
const INTENTIONALLY_OMITTED = new Set(['embedding', 'search_rank_vector']);

function schemaColumnNames(): Set<string> {
  return new Set(
    Object.values(getTableColumns(documents))
      .map((c) => c.name)
      .filter((name) => !INTENTIONALLY_OMITTED.has(name)),
  );
}

function extractColumnList(source: string, marker: RegExp): string[] {
  const match = source.match(marker);
  expect(match, `column list not found for ${marker}`).toBeTruthy();
  return match![1]
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

describe('documents dump/restore column lists match the schema', () => {
  const expected = schemaColumnNames();

  it('scripts/dump-db.sh exports every schema column', () => {
    const sh = readFileSync(join(REPO_ROOT, 'scripts', 'dump-db.sh'), 'utf8');
    const cols = extractColumnList(sh, /\\copy \(SELECT ([^)]+) FROM documents\)/);
    expect(new Set(cols)).toEqual(expected);
  });

  it('lib/db/init.ts restores every schema column', () => {
    const ts = readFileSync(join(REPO_ROOT, 'lib', 'db', 'init.ts'), 'utf8');
    const cols = extractColumnList(ts, /copy documents\(([^)]+)\) FROM STDIN/);
    expect(new Set(cols)).toEqual(expected);
  });
});
