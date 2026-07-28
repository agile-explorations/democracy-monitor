import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';
import { buildDateFilter } from '@/lib/services/search-service';

const render = (f?: string, t?: string) => new PgDialect().sqlToQuery(buildDateFilter(f, t)).sql;

describe('buildDateFilter boundary (#date-leak)', () => {
  it('treats dateTo as inclusive of that day but strictly before the next', () => {
    const q = render(undefined, '2025-01-19');
    expect(q).toContain("< $1::timestamptz + interval '1 day'");
    expect(q).not.toContain('<=');
  });

  it('keeps dateFrom inclusive', () => {
    expect(render('2021-01-20', undefined)).toContain('>= $1::timestamptz');
  });

  it('renders empty when no bounds are given', () => {
    expect(render()).toBe('');
  });
});
