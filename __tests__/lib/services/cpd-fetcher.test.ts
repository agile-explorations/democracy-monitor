import { describe, it, expect } from 'vitest';
import { summaryToContentItem } from '@/lib/services/cpd-fetcher';

describe('summaryToContentItem', () => {
  it('converts a CPD summary to a ContentItem with correct fields', () => {
    const item = summaryToContentItem('DCPD-202500184', {
      title: 'Remarks in an Exchange With Reporters',
      dateIssued: '2025-01-25',
      dcpdCategory: [
        { level1: 'Interviews With the News Media', level2: 'Exchanges with reporters' },
      ],
      download: {
        htmlLink: 'https://www.govinfo.gov/content/pkg/DCPD-202500184/html/DCPD-202500184.htm',
      },
    });

    expect(item.title).toBe('Remarks in an Exchange With Reporters');
    expect(item.pubDate).toBe('2025-01-25');
    expect(item.link).toBe(
      'https://www.govinfo.gov/content/pkg/DCPD-202500184/html/DCPD-202500184.htm',
    );
    expect(item.sourceOrigin).toBe('govinfo_cpd');
    expect(item.type).toBe('presidential_interview');
    expect(item.agency).toBe('Executive Office of the President');
    expect(item.metadata).toMatchObject({
      packageId: 'DCPD-202500184',
      collectionCode: 'DCPD',
      dcpdCategory: 'Interviews With the News Media',
    });
  });

  it('maps dcpdCategory to appropriate sourceType', () => {
    const cases: Array<[string, string]> = [
      ['Executive Orders', 'executive_order'],
      ['Presidential Memorandums', 'presidential_memorandum'],
      ['Proclamations', 'proclamation'],
      ['Letters and Messages', 'presidential_letter'],
      ['Statements by the President', 'presidential_statement'],
      ['Remarks', 'presidential_remarks'],
      ['Addresses and Remarks', 'presidential_remarks'],
      ['Unknown Category', 'presidential_document'],
    ];

    for (const [cat, expectedType] of cases) {
      const item = summaryToContentItem('DCPD-TEST', {
        title: 'Test',
        dcpdCategory: [{ level1: cat }],
      });
      expect(item.type, `dcpdCategory "${cat}" should map to "${expectedType}"`).toBe(expectedType);
    }
  });

  it('falls back to details URL when no download links available', () => {
    const item = summaryToContentItem('DCPD-202500001', {
      title: 'Test Document',
    });
    expect(item.link).toBe('https://www.govinfo.gov/app/details/DCPD-202500001');
  });

  it('stores subject terms in metadata', () => {
    const item = summaryToContentItem('DCPD-TEST', {
      title: 'Test',
      subject: [
        { level1: 'Inspector General' },
        { level1: 'Department of Justice Inspector General' },
      ],
    });
    expect(item.metadata?.subjects).toEqual([
      'Inspector General',
      'Department of Justice Inspector General',
    ]);
  });
});
