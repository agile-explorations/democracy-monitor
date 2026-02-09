import { describe, expect, it } from 'vitest';
import { escapeCell, toCsv } from '@/lib/utils/csv';

describe('escapeCell', () => {
  it('returns empty string for null and undefined', () => {
    expect(escapeCell(null)).toBe('');
    expect(escapeCell(undefined)).toBe('');
  });

  it('passes through simple strings', () => {
    expect(escapeCell('hello')).toBe('hello');
  });

  it('quotes strings with commas', () => {
    expect(escapeCell('a,b')).toBe('"a,b"');
  });

  it('escapes double quotes', () => {
    expect(escapeCell('say "hi"')).toBe('"say ""hi"""');
  });

  it('quotes strings with newlines', () => {
    expect(escapeCell('line1\nline2')).toBe('"line1\nline2"');
  });

  it('serializes objects as quoted JSON', () => {
    expect(escapeCell({ a: 1 })).toBe('"{""a"":1}"');
  });

  it('serializes arrays as quoted JSON', () => {
    expect(escapeCell([1, 2])).toBe('"[1,2]"');
  });

  it('converts numbers to strings', () => {
    expect(escapeCell(42)).toBe('42');
  });

  it('converts booleans to strings', () => {
    expect(escapeCell(true)).toBe('true');
  });
});

describe('toCsv', () => {
  it('returns empty string for empty array', () => {
    expect(toCsv([])).toBe('');
  });

  it('produces header + data rows', () => {
    const rows = [
      { name: 'Alice', age: 30 },
      { name: 'Bob', age: 25 },
    ];
    const csv = toCsv(rows);
    expect(csv).toBe('name,age\nAlice,30\nBob,25');
  });

  it('uses explicit columns', () => {
    const rows = [{ name: 'Alice', age: 30, email: 'a@b.c' }];
    const csv = toCsv(rows, ['name', 'email']);
    expect(csv).toBe('name,email\nAlice,a@b.c');
  });

  it('handles null values in rows', () => {
    const rows = [{ a: 'x', b: null }];
    const csv = toCsv(rows);
    expect(csv).toBe('a,b\nx,');
  });

  it('serializes JSONB columns as quoted CSV', () => {
    const rows = [{ id: 1, tags: ['foo', 'bar'] }];
    const csv = toCsv(rows);
    expect(csv).toBe('id,tags\n1,"[""foo"",""bar""]"');
  });
});
