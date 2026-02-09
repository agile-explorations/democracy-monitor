import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as dbModule from '@/lib/db';
import {
  getLegislativeSummary,
  getLegislativeItems,
} from '@/lib/services/legislative-dashboard-service';

vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn(),
  getDb: vi.fn(),
}));

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
