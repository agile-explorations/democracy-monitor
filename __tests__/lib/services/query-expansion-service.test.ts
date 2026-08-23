import { describe, expect, it } from 'vitest';
import {
  cachedCountUsable,
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

  it('drops non-strings and out-of-bounds lengths, caps at 12', () => {
    const sixteen = JSON.stringify([
      42,
      'ab',
      'x'.repeat(61),
      ...Array.from({ length: 16 }, (_, i) => `Term ${i}`),
    ]);
    const parsed = parseAliasResponse(sixteen);
    expect(parsed).toHaveLength(12);
    expect(parsed[0]).toBe('Term 0');
  });
});

describe('citationVariants', () => {
  it('parenthesizes bare subsection letters (287g -> 287(g))', () => {
    expect(citationVariants('287g agreements')).toContain('287(g) agreements');
  });

  it('collapses parenthesized subsections (212(f) -> 212f)', () => {
    expect(citationVariants('INA 212(f)')).toContain('INA 212f');
  });

  it('returns [] when no citation pattern is present', () => {
    expect(citationVariants('Schedule F')).toEqual([]);
    expect(citationVariants('H.R. 3005')).toEqual([]);
  });

  it('handles multiple citations in one phrase', () => {
    expect(citationVariants('287g and 235b')).toEqual(
      expect.arrayContaining(['287(g) and 235(b)', '287g', '287(g)', '235b', '235(b)']),
    );
  });

  it('emits bare citation tokens from a longer phrase, both spellings (#716)', () => {
    const v = citationVariants('287g agreements');
    expect(v).toEqual(expect.arrayContaining(['287(g) agreements', '287g', '287(g)']));
    const v2 = citationVariants('INA 212(f)');
    expect(v2).toEqual(expect.arrayContaining(['INA 212f', '212(f)', '212f']));
  });

  it('does not re-emit the phrase itself when it IS the bare citation', () => {
    expect(citationVariants('287(g)')).toEqual(['287g']);
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

describe('cachedCountUsable (#729 validation caching)', () => {
  it('an unsaturated count is exact and reusable at any cap', () => {
    expect(cachedCountUsable({ matches: 87, cap: 200 }, 1000)).toBe(true);
    expect(cachedCountUsable({ matches: 0, cap: 200 }, 500)).toBe(true);
  });

  it('a saturated count is reusable only when its cap covers the current one', () => {
    expect(cachedCountUsable({ matches: 201, cap: 200 }, 200)).toBe(true);
    expect(cachedCountUsable({ matches: 201, cap: 200 }, 150)).toBe(true);
    expect(cachedCountUsable({ matches: 201, cap: 200 }, 1000)).toBe(false); // must recount
  });
});

describe('mode-derived alias cap (#763)', () => {
  const sixteen = JSON.stringify(Array.from({ length: 20 }, (_, i) => `term number ${i}`));

  it('parses up to the provided limit', () => {
    expect(parseAliasResponse(sixteen, 16).length).toBe(16);
    expect(parseAliasResponse(sixteen).length).toBe(12);
  });
});
