import { describe, it, expect } from 'vitest';
import { docNumberFromUrl } from '@/lib/cron/annotate-retrieval-relevance';
import { retrievalRelevantOnlySql } from '@/lib/db/document-filters';
import { chunk } from '@/lib/utils/collections';

describe('docNumberFromUrl', () => {
  it('extracts the FR document number from a document URL', () => {
    expect(
      docNumberFromUrl(
        'https://www.federalregister.gov/documents/2025/09/03/2025-16805/discontinuance-of-information-collections',
      ),
    ).toBe('2025-16805');
  });

  it('handles query strings and fragments after the slug', () => {
    expect(
      docNumberFromUrl('https://www.federalregister.gov/documents/2020/09/02/2020-19325/title'),
    ).toBe('2020-19325');
  });

  it('returns null for non-FR URLs', () => {
    expect(docNumberFromUrl('https://www.courtlistener.com/opinion/12345/foo/')).toBeNull();
    expect(docNumberFromUrl('https://www.federalregister.gov/agencies/faa')).toBeNull();
  });
});

describe('chunk', () => {
  it('splits into consecutive fixed-size chunks with a smaller tail', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });

  it('returns a single chunk when size exceeds length', () => {
    expect(chunk([1, 2], 10)).toEqual([[1, 2]]);
  });

  it('returns empty for an empty array', () => {
    expect(chunk([], 3)).toEqual([]);
  });
});

describe('retrievalRelevantOnlySql', () => {
  it('emits the null-safe exclusion for an aliased documents table', () => {
    expect(retrievalRelevantOnlySql('d')).toBe('d.retrieval_relevant IS NOT FALSE');
  });
});
