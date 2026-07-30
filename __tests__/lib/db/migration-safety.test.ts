import { describe, expect, it } from 'vitest';
import {
  findDestructiveStatements,
  pendingDestructiveMigrations,
  shouldBlockMigration,
} from '@/lib/db/migration-safety';

describe('findDestructiveStatements', () => {
  it('flags data-destroying DDL', () => {
    expect(findDestructiveStatements('DROP TABLE "legislative_items" CASCADE;')).toEqual([
      'DROP TABLE',
    ]);
    expect(findDestructiveStatements('ALTER TABLE x DROP COLUMN y;')).toEqual(['DROP COLUMN']);
    expect(findDestructiveStatements('TRUNCATE documents CASCADE;')).toEqual(['TRUNCATE']);
  });

  it('ignores non-destructive DROPs (index/constraint)', () => {
    expect(
      findDestructiveStatements('DROP INDEX idx_foo; ALTER TABLE x DROP CONSTRAINT c;'),
    ).toEqual([]);
  });

  it('dedupes and normalizes whitespace/case', () => {
    expect(findDestructiveStatements('drop   table a;\nDROP TABLE b;')).toEqual(['DROP TABLE']);
  });

  it('returns empty for additive migrations', () => {
    expect(
      findDestructiveStatements('CREATE TABLE x (id serial); ALTER TABLE x ADD COLUMN y int;'),
    ).toEqual([]);
  });
});

describe('pendingDestructiveMigrations', () => {
  const entries = [{ tag: '0000_a' }, { tag: '0001_b' }, { tag: '0002_c' }];
  const sql: Record<string, string> = {
    '0000_a': 'CREATE TABLE a (id int);',
    '0001_b': 'DROP TABLE a;',
    '0002_c': 'ALTER TABLE b ADD COLUMN c int;',
  };
  const read = (tag: string) => sql[tag];

  it('scans only not-yet-applied migrations', () => {
    // 2 applied → only 0002_c pending (additive) → nothing destructive
    expect(pendingDestructiveMigrations(entries, 2, read)).toEqual([]);
  });

  it('detects a destructive pending migration', () => {
    // 1 applied → 0001_b (DROP) + 0002_c pending
    expect(pendingDestructiveMigrations(entries, 1, read)).toEqual([
      { tag: '0001_b', statements: ['DROP TABLE'] },
    ]);
  });

  it('treats a fresh DB (0 applied) as all-pending', () => {
    expect(pendingDestructiveMigrations(entries, 0, read)).toEqual([
      { tag: '0001_b', statements: ['DROP TABLE'] },
    ]);
  });
});

describe('shouldBlockMigration', () => {
  const destructive = [{ tag: '0001_b', statements: ['DROP TABLE'] }];

  it('blocks destructive DDL in production without confirmation', () => {
    expect(shouldBlockMigration({ destructive, isProduction: true, confirmed: false })).toBe(true);
  });

  it('allows when confirmed', () => {
    expect(shouldBlockMigration({ destructive, isProduction: true, confirmed: true })).toBe(false);
  });

  it('allows outside production', () => {
    expect(shouldBlockMigration({ destructive, isProduction: false, confirmed: false })).toBe(
      false,
    );
  });

  it('allows when nothing destructive is pending', () => {
    expect(shouldBlockMigration({ destructive: [], isProduction: true, confirmed: false })).toBe(
      false,
    );
  });
});
