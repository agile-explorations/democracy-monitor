import { describe, expect, it } from 'vitest';
import {
  expandAndValidate,
  isBoilerplateAlias,
  parseAliasResponse,
  windowFilters,
  citationVariants,
} from '@/lib/services/query-expansion-service';

describe('parseAliasResponse', () => {
  it('parses a plain JSON array', () => {
    expect(parseAliasResponse('["Schedule F", "Executive Order 13957"]')).toEqual([
      'Schedule F',
      'Executive Order 13957',
    ]);
  });

  it('strips markdown code fences', () => {
    expect(parseAliasResponse('```json\n["Loper Bright"]\n```')).toEqual(['Loper Bright']);
  });

  it('returns [] for unparseable content', () => {
    expect(parseAliasResponse('Sorry, I cannot help with that.')).toEqual([]);
  });

  it('returns [] for a non-array JSON value', () => {
    expect(parseAliasResponse('{"terms": ["x"]}')).toEqual([]);
  });

  it('drops non-strings and out-of-bounds lengths, caps at 8', () => {
    const twelve = JSON.stringify([
      42,
      'ab',
      'x'.repeat(61),
      ...Array.from({ length: 12 }, (_, i) => `Term ${i}`),
    ]);
    const parsed = parseAliasResponse(twelve);
    expect(parsed).toHaveLength(8);
    expect(parsed[0]).toBe('Term 0');
  });
});

describe('citationVariants', () => {
  it('parenthesizes bare subsection letters (287g -> 287(g))', () => {
    expect(citationVariants('287g agreements')).toEqual(['287(g) agreements']);
  });

  it('collapses parenthesized subsections (212(f) -> 212f)', () => {
    expect(citationVariants('INA 212(f)')).toEqual(['INA 212f']);
  });

  it('returns [] when no citation pattern is present', () => {
    expect(citationVariants('Schedule F')).toEqual([]);
    expect(citationVariants('H.R. 3005')).toEqual([]);
  });

  it('handles multiple citations in one phrase', () => {
    expect(citationVariants('287g and 235b')).toEqual(['287(g) and 235(b)']);
  });
});

describe('isBoilerplateAlias', () => {
  it('rejects self-referential corpus terms', () => {
    for (const term of ['Congress', 'congressional record', ' Senate ', 'Executive Order']) {
      expect(isBoilerplateAlias(term)).toBe(true);
    }
  });

  it('keeps entity terms, including ones containing boilerplate words', () => {
    for (const term of ['Schedule F', 'Executive Order 13957', 'Senate Judiciary Committee']) {
      expect(isBoilerplateAlias(term)).toBe(false);
    }
  });
});

describe('windowFilters', () => {
  it('builds a clause for every window shape', () => {
    for (const w of [
      {},
      { dateFrom: '2025-01-20' },
      { dateTo: '2026-01-01' },
      { category: 'executiveActions' },
      { tier: 'action' as const },
      { tier: 'discussion' as const, dateFrom: '2020-01-01', dateTo: '2021-01-19' },
    ]) {
      expect(windowFilters(w)).toBeDefined();
    }
  });
});

describe('expandAndValidate kill switch', () => {
  it('returns no aliases when HYBRID_RETRIEVAL_DISABLED=1', async () => {
    process.env.HYBRID_RETRIEVAL_DISABLED = '1';
    try {
      await expect(expandAndValidate('any query', {})).resolves.toEqual([]);
    } finally {
      delete process.env.HYBRID_RETRIEVAL_DISABLED;
    }
  });
});
