import { describe, expect, it } from 'vitest';
import { parseGovInfoParams, toContentItem } from '@/lib/services/govinfo-fetcher';

describe('parseGovInfoParams', () => {
  it('extracts collection from pseudo-URL', () => {
    const result = parseGovInfoParams('govinfo://collection?collection=GAOREPORTS');
    expect(result.collection).toBe('GAOREPORTS');
  });

  it('extracts offset parameter', () => {
    const result = parseGovInfoParams('govinfo://collection?collection=GAOREPORTS&offset=100');
    expect(result.collection).toBe('GAOREPORTS');
    expect(result.offset).toBe(100);
  });

  it('defaults to GAOREPORTS when collection not specified', () => {
    const result = parseGovInfoParams('govinfo://collection');
    expect(result.collection).toBe('GAOREPORTS');
  });

  it('returns undefined offset when not specified', () => {
    const result = parseGovInfoParams('govinfo://collection?collection=CRPT');
    expect(result.offset).toBeUndefined();
  });

  it('parses CRPT collection', () => {
    const result = parseGovInfoParams('govinfo://collection?collection=CRPT');
    expect(result.collection).toBe('CRPT');
  });

  it('parses PLAW collection', () => {
    const result = parseGovInfoParams('govinfo://collection?collection=PLAW');
    expect(result.collection).toBe('PLAW');
  });
});

describe('toContentItem', () => {
  it('maps GAO report fields correctly', () => {
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
    expect(item.type).toBe('gao_report');
    expect(item.sourceOrigin).toBe('govinfo');
  });

  it('maps congressional report fields correctly', () => {
    const item = toContentItem(
      {
        packageId: 'CRPT-119hrpt123',
        title: 'Oversight Committee Report',
        dateIssued: '2025-10-01',
      },
      'CRPT',
    );

    expect(item.type).toBe('congressional_report');
    expect(item.sourceOrigin).toBe('govinfo');
  });

  it('maps public law fields correctly', () => {
    const item = toContentItem({ packageId: 'PLAW-119publ45' }, 'PLAW');
    expect(item.type).toBe('public_law');
  });

  it('handles missing optional fields', () => {
    const item = toContentItem({}, 'GAOREPORTS');
    expect(item.title).toBe('(untitled document)');
    expect(item.link).toBe('https://www.govinfo.gov/app/details/undefined');
    expect(item.agency).toBe('Government Accountability Office');
    expect(item.type).toBe('gao_report');
    expect(item.sourceOrigin).toBe('govinfo');
  });

  it('prefers summary PDF link when available', () => {
    const item = toContentItem(
      { packageId: 'GAO-25-100' },
      'GAOREPORTS',
      {
        download: { pdfLink: 'https://www.govinfo.gov/content/pkg/GAO-25-100/pdf/GAO-25-100.pdf' },
      },
    );
    expect(item.link).toBe('https://www.govinfo.gov/content/pkg/GAO-25-100/pdf/GAO-25-100.pdf');
  });

  it('uses summary title when package title is missing', () => {
    const item = toContentItem(
      { packageId: 'GAO-25-100' },
      'GAOREPORTS',
      { title: 'Summary Title' },
    );
    expect(item.title).toBe('Summary Title');
  });

  it('includes abstract in summary', () => {
    const item = toContentItem(
      { packageId: 'GAO-25-100' },
      'GAOREPORTS',
      { abstract: 'This report examines federal oversight mechanisms.' },
    );
    expect(item.summary).toBe('This report examines federal oversight mechanisms.');
  });

  it('truncates long abstracts', () => {
    const longAbstract = 'A'.repeat(1000);
    const item = toContentItem(
      { packageId: 'GAO-25-100' },
      'GAOREPORTS',
      { abstract: longAbstract },
    );
    expect(item.summary!.length).toBeLessThanOrEqual(801);
  });

  it('uses summary dateIssued as fallback', () => {
    const item = toContentItem(
      { packageId: 'GAO-25-100' },
      'GAOREPORTS',
      { dateIssued: '2025-12-01' },
    );
    expect(item.pubDate).toBe('2025-12-01');
  });

  it('uses summary category as agency fallback', () => {
    const item = toContentItem(
      { packageId: 'GAO-25-100' },
      'GAOREPORTS',
      { category: 'Government Operations' },
    );
    expect(item.agency).toBe('Government Operations');
  });
});
