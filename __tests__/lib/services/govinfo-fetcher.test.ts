import { describe, expect, it } from 'vitest';
import {
  parseGovInfoParams,
  searchResultToContentItem,
  toContentItem,
} from '@/lib/services/govinfo-fetcher';

describe('parseGovInfoParams', () => {
  it('extracts collection from pseudo-URL', () => {
    const result = parseGovInfoParams('govinfo://collection?collection=CRPT');
    expect(result.collection).toBe('CRPT');
  });

  it('extracts offset parameter', () => {
    const result = parseGovInfoParams('govinfo://collection?collection=CRPT&offset=100');
    expect(result.collection).toBe('CRPT');
    expect(result.offset).toBe(100);
  });

  it('defaults to CRPT when collection not specified (GAOREPORTS removed in #529)', () => {
    const result = parseGovInfoParams('govinfo://collection');
    expect(result.collection).toBe('CRPT');
  });

  it('returns undefined offset when not specified', () => {
    const result = parseGovInfoParams('govinfo://collection?collection=CRPT');
    expect(result.offset).toBeUndefined();
  });

  it('parses PLAW collection', () => {
    const result = parseGovInfoParams('govinfo://collection?collection=PLAW');
    expect(result.collection).toBe('PLAW');
  });
});

describe('searchResultToContentItem', () => {
  it('maps search result fields correctly', () => {
    const item = searchResultToContentItem({
      packageId: 'CRPT-119hrpt123',
      title: 'Oversight Committee Report on Federal Spending',
      dateIssued: '2025-10-01',
      collectionCode: 'CRPT',
      governmentAuthor: ['House Committee on Oversight'],
      download: {
        pdfLink: 'https://www.govinfo.gov/content/pkg/CRPT-119hrpt123/pdf/CRPT-119hrpt123.pdf',
      },
    });

    expect(item.title).toBe('Oversight Committee Report on Federal Spending');
    expect(item.link).toBe(
      'https://www.govinfo.gov/content/pkg/CRPT-119hrpt123/pdf/CRPT-119hrpt123.pdf',
    );
    expect(item.pubDate).toBe('2025-10-01');
    expect(item.agency).toBe('House Committee on Oversight');
    expect(item.type).toBe('congressional_report');
    expect(item.sourceOrigin).toBe('govinfo');
    expect(item.metadata).toEqual({
      packageId: 'CRPT-119hrpt123',
      collectionCode: 'CRPT',
    });
  });

  it('falls back to txtLink when pdfLink missing', () => {
    const item = searchResultToContentItem({
      packageId: 'CRPT-119hrpt1',
      download: {
        txtLink: 'https://www.govinfo.gov/content/pkg/CRPT-119hrpt1/htm/CRPT-119hrpt1.htm',
      },
    });
    expect(item.link).toBe(
      'https://www.govinfo.gov/content/pkg/CRPT-119hrpt1/htm/CRPT-119hrpt1.htm',
    );
  });

  it('falls back to details URL when no download links', () => {
    const item = searchResultToContentItem({ packageId: 'PLAW-119publ5' });
    expect(item.link).toBe('https://www.govinfo.gov/app/details/PLAW-119publ5');
  });

  it('maps PLAW collection to public_law type', () => {
    const item = searchResultToContentItem({
      packageId: 'PLAW-119publ5',
      collectionCode: 'PLAW',
    });
    expect(item.type).toBe('public_law');
  });

  it('handles missing optional fields', () => {
    const item = searchResultToContentItem({});
    expect(item.title).toBe('(untitled document)');
    expect(item.agency).toBe('U.S. Government');
    expect(item.sourceOrigin).toBe('govinfo');
  });
});

describe('toContentItem (legacy)', () => {
  it('maps report fields correctly (GAOREPORTS removed in #529 → generic report type)', () => {
    const item = toContentItem(
      {
        packageId: 'GAO-25-107234',
        title: 'Federal Spending: Agencies Need Better Controls',
        dateIssued: '2025-11-15',
        docClass: 'GAO Reports',
      },
      'GAOREPORTS',
    );

    expect(item.title).toBe('Federal Spending: Agencies Need Better Controls');
    expect(item.link).toBe('https://www.govinfo.gov/app/details/GAO-25-107234');
    expect(item.pubDate).toBe('2025-11-15');
    expect(item.agency).toBe('GAO Reports');
    expect(item.type).toBe('report');
    expect(item.sourceOrigin).toBe('govinfo');
  });

  it('prefers summary PDF link when available', () => {
    const item = toContentItem({ packageId: 'GAO-25-100' }, 'GAOREPORTS', {
      download: { pdfLink: 'https://www.govinfo.gov/content/pkg/GAO-25-100/pdf/GAO-25-100.pdf' },
    });
    expect(item.link).toBe('https://www.govinfo.gov/content/pkg/GAO-25-100/pdf/GAO-25-100.pdf');
  });
});
