import { describe, expect, it, vi } from 'vitest';
import { ledgerRowToPackage } from '@/lib/services/corpus-restore/chrg';
import { opinionIdsFromUrls } from '@/lib/services/corpus-restore/cl';
import { selectUnroutedGranules } from '@/lib/services/corpus-restore/crec';
import type { ContentItem } from '@/lib/types';

vi.mock('@/lib/db', () => ({ getDb: vi.fn(), isDbAvailable: vi.fn(() => false) }));

describe('chrg ledgerRowToPackage', () => {
  it('splits comma-joined committees and requires a date', () => {
    expect(
      ledgerRowToPackage({
        packageId: 'CHRG-119hhrg12345',
        title: 'Hearing',
        committees: 'Judiciary,Oversight',
        dateIssued: '2025-04-01',
      }),
    ).toEqual({
      packageId: 'CHRG-119hhrg12345',
      title: 'Hearing',
      dateIssued: '2025-04-01',
      committees: ['Judiciary', 'Oversight'],
    });
    expect(
      ledgerRowToPackage({ packageId: 'x', title: 't', committees: null, dateIssued: '2025-04-01' })
        ?.committees,
    ).toEqual([]);
    expect(
      ledgerRowToPackage({ packageId: 'x', title: 't', committees: null, dateIssued: null }),
    ).toBeNull();
  });
});

describe('cl opinionIdsFromUrls', () => {
  it('extracts numeric ids from sub_opinions URLs', () => {
    expect(
      opinionIdsFromUrls([
        'https://www.courtlistener.com/api/rest/v4/opinions/123/',
        '/api/rest/v4/opinions/456/',
        '/api/rest/v4/clusters/789/',
      ]),
    ).toEqual(['123', '456']);
  });
});

describe('crec selectUnroutedGranules', () => {
  const granule = (granuleId: string, title: string, content = ''): ContentItem => ({
    title,
    content,
    link: `https://www.govinfo.gov/app/details/CREC-2025-03-04/${granuleId}`,
    metadata: { granuleId },
  });

  it('keeps unrouted granules not already stored, once per run', () => {
    const seen = new Set<string>();
    const items = [
      granule('g1', 'TRIBUTE TO A LOCAL BAKERY'),
      granule('g2', 'THE FEDERAL WORKFORCE', 'federal employees'),
      granule('g3', 'HONORING A RETIRING COACH'),
      granule('g1', 'TRIBUTE TO A LOCAL BAKERY'),
      { title: 'NO GRANULE ID' },
    ];
    const selected = selectUnroutedGranules(items, new Set(['g3']), seen);
    expect(selected.map((i) => i.metadata?.granuleId)).toEqual(['g1']);
    expect(selectUnroutedGranules([granule('g1', 'AGAIN')], new Set(), seen)).toEqual([]);
  });
});
