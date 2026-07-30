import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  chrgPackageUrl,
  fetchChrgWindow,
  isErrataPackage,
  mergeCommitteeBatches,
  searchChrgPackages,
  toContentItem,
} from '@/lib/services/chrg-fetcher';
import type { ChrgPackage } from '@/lib/services/chrg-fetcher';
import { fetchGovInfoText, searchGovInfo } from '@/lib/services/govinfo-fetcher';

vi.mock('@/lib/services/govinfo-fetcher', () => ({
  searchGovInfo: vi.fn(),
  fetchGovInfoText: vi.fn(),
}));

const searchMock = vi.mocked(searchGovInfo);
const textMock = vi.mocked(fetchGovInfoText);

function pkg(overrides: Partial<ChrgPackage>): ChrgPackage {
  return {
    packageId: 'CHRG-119hhrg64055',
    title: 'E-Verify: Ensuring Lawful Employment in America',
    dateIssued: '2025-11-19',
    committees: ['Judiciary'],
    ...overrides,
  };
}

beforeEach(() => {
  searchMock.mockReset();
  textMock.mockReset();
  vi.stubEnv('GOVINFO_API_KEY', 'test-key');
});

describe('mergeCommitteeBatches', () => {
  it('dedupes joint hearings across committee queries, unioning tags', () => {
    const result = { packageId: 'CHRG-1', title: 'Joint Hearing', dateIssued: '2019-05-01' };
    const merged = mergeCommitteeBatches([
      { committee: 'Judiciary', results: [result] },
      { committee: 'Homeland Security', results: [result] },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].committees).toEqual(['Judiciary', 'Homeland Security']);
  });

  it('drops results missing packageId or dateIssued', () => {
    const merged = mergeCommitteeBatches([
      {
        committee: 'Oversight',
        results: [
          { title: 'No id', dateIssued: '2019-05-01' },
          { packageId: 'CHRG-2', title: 'No date' },
          { packageId: 'CHRG-3', title: 'Complete', dateIssued: '2019-05-02' },
        ],
      },
    ]);
    expect(merged).toHaveLength(1);
    expect(merged[0].packageId).toBe('CHRG-3');
  });
});

describe('toContentItem', () => {
  it('produces a hearing_transcript ContentItem with committee metadata', () => {
    const item = toContentItem(pkg({ committees: ['Judiciary', 'Intelligence'] }), 'Full text');

    expect(item.title).toBe('E-Verify: Ensuring Lawful Employment in America');
    expect(item.link).toBe('https://www.govinfo.gov/app/details/CHRG-119hhrg64055');
    expect(item.pubDate).toBe('2025-11-19');
    expect(item.type).toBe('hearing_transcript');
    expect(item.sourceOrigin).toBe('chrg');
    expect(item.content).toBe('Full text');
    expect(item.metadata).toEqual({
      packageId: 'CHRG-119hhrg64055',
      collectionCode: 'CHRG',
      chrgCommittees: ['Judiciary', 'Intelligence'],
    });
  });

  it('leaves content undefined when text fetch failed', () => {
    expect(toContentItem(pkg({}), null).content).toBeUndefined();
  });
});

describe('searchChrgPackages', () => {
  it('returns empty without an API key', async () => {
    vi.stubEnv('GOVINFO_API_KEY', '');
    expect(await searchChrgPackages({ dateFrom: '2019-01-01', dateTo: '2019-12-31' })).toEqual([]);
  });

  it('queries every scoped committee and follows pagination cursors', async () => {
    // The mock answers only correctly-formed judiciary queries, with a second
    // page behind a cursor — the output proves query construction, committee
    // fan-out, and cursor following without inspecting call args.
    searchMock.mockImplementation(async (query, _key, _size, offsetMark) => {
      const wellFormed =
        query.includes('collection:(CHRG)') &&
        query.includes('publishdate:range(2019-01-01,2019-12-31)');
      if (!wellFormed || !query.includes('committee:(judiciary)')) {
        return { results: [], offsetMark: null };
      }
      if (offsetMark === '*') {
        return {
          results: Array.from({ length: 100 }, (_, i) => ({
            packageId: `CHRG-a${i}`,
            title: 'T',
            dateIssued: '2019-05-01',
          })),
          offsetMark: 'next-1',
        };
      }
      return {
        results: [{ packageId: 'CHRG-last', title: 'T', dateIssued: '2019-05-02' }],
        offsetMark: null,
      };
    });

    const packages = await searchChrgPackages({ dateFrom: '2019-01-01', dateTo: '2019-12-31' });

    // 100 first-page + 1 cursor-page results, all tagged with the committee
    // whose query produced them.
    expect(packages).toHaveLength(101);
    expect(packages.find((p) => p.packageId === 'CHRG-last')).toBeDefined();
    expect(new Set(packages.flatMap((p) => p.committees))).toEqual(new Set(['Judiciary']));
  });
});

describe('fetchChrgWindow', () => {
  it('anti-joins stored packageIds and bounds new fetches', async () => {
    searchMock.mockResolvedValue({
      results: [
        { packageId: 'CHRG-stored', title: 'Old', dateIssued: '2019-05-01' },
        { packageId: 'CHRG-new-1', title: 'New 1', dateIssued: '2019-05-02' },
        { packageId: 'CHRG-new-2', title: 'New 2', dateIssued: '2019-05-03' },
      ],
      offsetMark: null,
    });
    textMock.mockImplementation(async (packageId) => `text for ${packageId}`);

    const items = await fetchChrgWindow({
      dateFrom: '2019-01-01',
      dateTo: '2019-12-31',
      excludePackageIds: new Set(['CHRG-stored']),
      maxNewFetches: 1,
    });

    expect(items).toHaveLength(1);
    expect(items[0].metadata?.packageId).toBe('CHRG-new-1');
    expect(items[0].content).toBe('text for CHRG-new-1');
  });
});

describe('chrgPackageUrl', () => {
  it('builds the govinfo details URL', () => {
    expect(chrgPackageUrl('CHRG-119hhrg64055')).toBe(
      'https://www.govinfo.gov/app/details/CHRG-119hhrg64055',
    );
  });
});

describe('isErrataPackage', () => {
  it('matches errata stubs and passes real hearings', () => {
    expect(isErrataPackage('[ERRATA]  OVERSIGHT OF THE U.S. DEPARTMENT OF JUSTICE')).toBe(true);
    expect(isErrataPackage('[ Errata ] Some Hearing')).toBe(true);
    expect(isErrataPackage('Oversight of the U.S. Department of Justice')).toBe(false);
  });
});
