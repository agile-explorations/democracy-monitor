import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as dbModule from '@/lib/db';
import {
  getLegislativeSummary,
  storeLegislativeItems,
  getLegislativeItems,
} from '@/lib/services/legislative-dashboard-service';
import type { LegislativeItem } from '@/lib/types/legislative';

vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn(),
  getDb: vi.fn(),
}));

function makeLegislativeItem(overrides: Partial<LegislativeItem> = {}): LegislativeItem {
  return {
    id: 'CREC-2025-01-20',
    title: 'Oversight hearing on executive orders',
    type: 'hearing',
    date: '2025-01-20',
    url: 'https://www.govinfo.gov/app/details/CREC-2025-01-20',
    chamber: 'house',
    relevantCategories: ['courts'],
    ...overrides,
  };
}

describe('getLegislativeSummary', () => {
  beforeEach(() => {
    vi.mocked(dbModule.isDbAvailable).mockReset();
  });

  it('returns empty summary when DB is unavailable', async () => {
    vi.mocked(dbModule.isDbAvailable).mockReturnValue(false);

    const summary = await getLegislativeSummary();

    expect(summary.totalItems).toBe(0);
    expect(summary.byType).toEqual({});
    expect(summary.byChamber).toEqual({});
    expect(summary.byCategory).toEqual({});
    expect(summary.recentItems).toEqual([]);
  });
});

describe('storeLegislativeItems', () => {
  beforeEach(() => {
    vi.mocked(dbModule.isDbAvailable).mockReset();
  });

  it('does not call getDb when DB is unavailable', async () => {
    vi.mocked(dbModule.isDbAvailable).mockReturnValue(false);
    await storeLegislativeItems([makeLegislativeItem()]);
    expect(dbModule.getDb).not.toHaveBeenCalled();
  });

  it('does not call getDb for empty array', async () => {
    vi.mocked(dbModule.isDbAvailable).mockReturnValue(true);
    await storeLegislativeItems([]);
    expect(dbModule.getDb).not.toHaveBeenCalled();
  });
});

describe('getLegislativeItems', () => {
  beforeEach(() => {
    vi.mocked(dbModule.isDbAvailable).mockReset();
  });

  it('returns empty result when DB is unavailable', async () => {
    vi.mocked(dbModule.isDbAvailable).mockReturnValue(false);

    const result = await getLegislativeItems();

    expect(result.items).toEqual([]);
    expect(result.total).toBe(0);
  });
});
