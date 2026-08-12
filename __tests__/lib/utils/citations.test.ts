import { describe, expect, it } from 'vitest';
import { parseDocCitations } from '@/lib/utils/citations';

describe('parseDocCitations (#712)', () => {
  it('parses single, multi, plural, and range citation groups', () => {
    expect(parseDocCitations('claim [Doc 3].')).toEqual([3]);
    expect(parseDocCitations('claim [Doc 2, Doc 4].')).toEqual([2, 4]);
    expect(parseDocCitations('claims [Docs 1, 3, 5] and [Doc 7].')).toEqual([1, 3, 5, 7]);
    expect(parseDocCitations('range [Docs 19-21].')).toEqual([19, 20, 21]);
    expect(parseDocCitations('en-dash [Docs 19–21].')).toEqual([19, 20, 21]);
  });

  it('deduplicates and ignores non-citation brackets', () => {
    expect(parseDocCitations('[Doc 3] and again [Doc 3]')).toEqual([3]);
    expect(parseDocCitations('nothing here [2024] or [S. 174]')).toEqual([]);
  });

  it('refuses absurd ranges', () => {
    expect(parseDocCitations('[Docs 1-999]')).toEqual([1, 999]);
  });
});
