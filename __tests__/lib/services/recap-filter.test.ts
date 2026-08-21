import { describe, expect, it } from 'vitest';
import type { RecapDocumentMeta } from '@/lib/services/recap-filter';
import { classifyRecapDocument, MIN_ORDER_PAGES } from '@/lib/services/recap-filter';

function doc(overrides: Partial<RecapDocumentMeta>): RecapDocumentMeta {
  return {
    id: 1,
    description: '',
    entryDescription: '',
    isAvailable: true,
    pageCount: 10,
    ...overrides,
  };
}

describe('classifyRecapDocument (#740)', () => {
  it('ingests the marquee court-authored shapes', () => {
    const shapes = [
      'ORDER on Motion to Dismiss for Improper Appointment of U.S. Attorney', // the Comey dismissal
      'MEMORANDUM OPINION',
      'OPINION AND ORDER',
      'Findings of Fact and Conclusions of Law',
      'REPORT AND RECOMMENDATION',
      'JUDGMENT of acquittal',
    ];
    for (const s of shapes) {
      expect(classifyRecapDocument(doc({ entryDescription: s })), s).toBe('ingest');
    }
  });

  it('ingests charging instruments', () => {
    expect(
      classifyRecapDocument(doc({ entryDescription: 'INDICTMENT as to James B. Comey' })),
    ).toBe('ingest');
    expect(
      classifyRecapDocument(doc({ entryDescription: 'SUPERSEDING INDICTMENT (two counts)' })),
    ).toBe('ingest');
  });

  it('skips party paper even when it mentions orders', () => {
    const shapes = [
      'MOTION to Dismiss Indictment',
      'RESPONSE in Opposition re Motion',
      'Proposed Order re scheduling',
      'REPLY to Response to Motion',
      'TRANSCRIPT of proceedings',
      'NOTICE OF APPEARANCE',
      'Minute Entry for proceedings held',
    ];
    for (const s of shapes) {
      expect(classifyRecapDocument(doc({ entryDescription: s })), s).toBe('skip_party_paper');
    }
  });

  it('skips one-line docket orders by page count, keeps substantive ones', () => {
    expect(
      classifyRecapDocument(doc({ entryDescription: 'ORDER granting extension', pageCount: 1 })),
    ).toBe('skip_short_order');
    expect(
      classifyRecapDocument(
        doc({ entryDescription: 'ORDER granting extension', pageCount: MIN_ORDER_PAGES }),
      ),
    ).toBe('ingest');
    // Substantive shapes ignore the page floor (a 1-page judgment counts).
    expect(classifyRecapDocument(doc({ entryDescription: 'JUDGMENT', pageCount: 1 }))).toBe(
      'ingest',
    );
  });

  it('skips unavailable documents (sealed / not yet uploaded)', () => {
    expect(
      classifyRecapDocument(doc({ entryDescription: 'MEMORANDUM OPINION', isAvailable: false })),
    ).toBe('skip_unavailable');
  });
});
