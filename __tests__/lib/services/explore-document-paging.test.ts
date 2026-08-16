import { describe, expect, it } from 'vitest';
import { docKey, orderedUniqueDocKeys } from '@/lib/services/explore-document-paging';

describe('docKey', () => {
  it('keys on url when present, id otherwise', () => {
    expect(docKey('https://x.gov/a', 1)).toBe('https://x.gov/a');
    expect(docKey(null, 42)).toBe('_id_42');
  });
});

describe('orderedUniqueDocKeys', () => {
  it('collapses category rows of one document to a single key at its best rank', () => {
    const keys = orderedUniqueDocKeys([
      { id: 1, url: 'https://x.gov/eo' },
      { id: 2, url: 'https://x.gov/rule' },
      { id: 3, url: 'https://x.gov/eo' }, // second category row of the EO
    ]);
    expect(keys).toEqual(['https://x.gov/eo', 'https://x.gov/rule']);
  });

  it('keeps url-less rows distinct by id', () => {
    const keys = orderedUniqueDocKeys([
      { id: 7, url: null },
      { id: 8, url: null },
      { id: 7, url: null },
    ]);
    expect(keys).toEqual(['_id_7', '_id_8']);
  });

  it('preserves the incoming order (first occurrence wins)', () => {
    const keys = orderedUniqueDocKeys([
      { id: 5, url: 'b' },
      { id: 6, url: 'a' },
      { id: 9, url: 'b' },
    ]);
    expect(keys).toEqual(['b', 'a']);
  });
});
