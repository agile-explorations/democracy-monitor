import { afterEach, describe, it, expect, vi } from 'vitest';
import {
  fetchCpdHistorical,
  partitionCpdDocuments,
  selectNewPackages,
  summaryToContentItem,
} from '@/lib/services/cpd-fetcher';
import type { CpdDocument } from '@/lib/services/cpd-fetcher';

vi.mock('@/lib/utils/async', () => ({ sleep: vi.fn().mockResolvedValue(undefined) }));

describe('partitionCpdDocuments (#892)', () => {
  const routed: CpdDocument = {
    item: { title: 'EO on Iraq', link: 'https://govinfo/1' },
    categories: ['executiveActions'],
    unmappedSubjects: [],
  };
  const unrouted: CpdDocument = {
    item: { title: 'Remarks at a dinner', link: 'https://govinfo/2' },
    categories: [],
    unmappedSubjects: ['Dinners'],
  };

  it('keeps routed documents whole and hands back only the items of unrouted ones', () => {
    expect(partitionCpdDocuments([routed, unrouted])).toEqual({
      routed: [routed],
      unrouted: [unrouted.item],
    });
  });

  it('returns two empty lists for no documents', () => {
    expect(partitionCpdDocuments([])).toEqual({ routed: [], unrouted: [] });
  });
});

describe('fetchCpdHistorical zero-category packages (#892)', () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.GOVINFO_API_KEY;

  afterEach(() => {
    global.fetch = originalFetch;
    process.env.GOVINFO_API_KEY = originalKey;
  });

  /** One package whose only subject is unmapped, with a fetchable body. */
  function mockGovInfo(): void {
    process.env.GOVINFO_API_KEY = 'test-key';
    global.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) =>
        ({ ok: true, status: 200, json: async () => body, text: async () => '' }) as Response;
      if (url.includes('/search')) {
        return json({ results: [{ packageId: 'DCPD-202600001' }], offsetMark: null, count: 1 });
      }
      if (url.endsWith('/summary?api_key=test-key')) {
        return json({
          title: 'Remarks at a Dinner',
          dateIssued: '2026-03-01',
          subject: [{ level1: 'Dinners, unmapped' }],
          dcpdCategory: [{ level1: 'Remarks' }],
        });
      }
      if (url.endsWith('/htm?api_key=test-key')) {
        return {
          ok: true,
          status: 200,
          text: async () => '<html><body><p>Thank you all for coming.</p></body></html>',
        } as Response;
      }
      return { ok: false, status: 404, text: async () => '' } as Response;
    }) as unknown as typeof fetch;
  }

  it('returns the package with categories: [] and its content instead of skipping it', async () => {
    mockGovInfo();

    const docs = await fetchCpdHistorical({ dateFrom: '2026-03-01', dateTo: '2026-03-07' });

    expect(docs).toHaveLength(1);
    expect(docs[0].categories).toEqual([]);
    expect(docs[0].unmappedSubjects).toEqual(['Dinners, unmapped']);
    expect(docs[0].item.title).toBe('Remarks at a Dinner');
    expect(docs[0].item.content).toContain('Thank you all for coming.');
    expect(partitionCpdDocuments(docs).unrouted).toEqual([docs[0].item]);
  });
});

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

describe('summaryToContentItem branch coverage (#718 gate)', () => {
  const base = { title: 'T', dateIssued: '2025-01-01' };

  it('falls through download links html -> pdf -> txt -> details', () => {
    expect(summaryToContentItem('DCPD-1', { ...base, download: { pdfLink: 'pdf' } }).link).toBe(
      'pdf',
    );
    expect(summaryToContentItem('DCPD-1', { ...base, download: { txtLink: 'txt' } }).link).toBe(
      'txt',
    );
    expect(summaryToContentItem('DCPD-1', { ...base }).link).toBe(
      'https://www.govinfo.gov/app/details/DCPD-1',
    );
  });

  it('defaults an untitled document', () => {
    expect(summaryToContentItem('DCPD-1', { dateIssued: 'd' } as never).title).toBe(
      '(untitled document)',
    );
  });

  it('maps every dcpdCategory level to its source type', () => {
    const t = (level1: string) =>
      summaryToContentItem('DCPD-1', { ...base, dcpdCategory: [{ level1 }] }).type;
    expect(t('Executive Orders')).toBe('executive_order');
    expect(t('Memorandums')).toBe('presidential_memorandum');
    expect(t('Proclamations')).toBe('proclamation');
    expect(t('Letters')).toBe('presidential_letter');
    expect(t('Statements by the President')).toBe('presidential_statement');
    expect(t('Remarks')).toBe('presidential_remarks');
    expect(t('Addresses to the Nation')).toBe('presidential_remarks');
    expect(t('Interviews')).toBe('presidential_interview');
    expect(t('Other')).toBe('presidential_document');
    expect(summaryToContentItem('DCPD-1', { ...base }).type).toBe('presidential_document');
  });

  it('collects subjects and category metadata', () => {
    const item = summaryToContentItem('DCPD-1', {
      ...base,
      dcpdCategory: [{ level1: 'Remarks' }],
      subject: [{ level1: 'Immigration' }, { level1: undefined }, { level1: 'Labor' }],
    } as never);
    expect(item.metadata).toMatchObject({
      dcpdCategory: 'Remarks',
      subjects: ['Immigration', 'Labor'],
    });
  });
});

describe('selectNewPackages (#798 trailing window)', () => {
  const found = ['DCPD-202600230', 'DCPD-202600231', 'DCPD-202600232', 'DCPD-202600233'];

  it('drops already-stored packages and keeps GovInfo order', () => {
    const plan = selectNewPackages(found, new Set(['DCPD-202600230', 'DCPD-202600232']));
    expect(plan.fetch).toEqual(['DCPD-202600231', 'DCPD-202600233']);
    expect(plan.alreadyStored).toBe(2);
    expect(plan.deferred).toBe(0);
  });

  it('caps new fetches and reports what it deferred', () => {
    const plan = selectNewPackages(found, undefined, 3);
    expect(plan.fetch).toHaveLength(3);
    expect(plan.deferred).toBe(1);
  });

  it('is a no-op filter when nothing is stored and no cap is given', () => {
    expect(selectNewPackages(found)).toEqual({ fetch: found, alreadyStored: 0, deferred: 0 });
  });
});
