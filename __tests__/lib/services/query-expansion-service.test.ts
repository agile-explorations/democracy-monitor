import { describe, expect, it } from 'vitest';
import { isBoilerplateAlias, parseAliasResponse } from '@/lib/services/query-expansion-service';

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
