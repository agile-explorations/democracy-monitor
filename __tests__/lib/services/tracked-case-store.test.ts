import type { Mock } from 'vitest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDb, isDbAvailable } from '@/lib/db';
import { upsertTrackedCasesFromItems } from '@/lib/services/tracked-case-store';
import type { ContentItem } from '@/lib/types';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn(),
}));

function docketItem(overrides: Partial<ContentItem> = {}): ContentItem {
  return {
    title: 'Doe v. Agency',
    link: 'https://www.courtlistener.com/docket/12345/doe-v-agency/',
    pubDate: '2026-08-01T12:00:00Z',
    type: 'court_opinion',
    metadata: { caseId: 'cl:12345', docketNumber: '1:26-cv-00042', suitNature: 'Civil Rights' },
    ...overrides,
  } as ContentItem;
}

describe('upsertTrackedCasesFromItems', () => {
  let execute: Mock;

  beforeEach(() => {
    vi.clearAllMocks();
    execute = vi.fn().mockResolvedValue({ rows: [] });
    vi.mocked(isDbAvailable).mockReturnValue(true);
    vi.mocked(getDb).mockReturnValue({ execute } as never);
  });

  it('upserts one row per valid docket item and returns the count', async () => {
    const count = await upsertTrackedCasesFromItems(
      [docketItem(), docketItem({ metadata: { caseId: 'cl:678' } })],
      'civilLiberties',
    );
    expect(count).toBe(2);
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it('upserts only items with a well-formed cl:<digits> caseId', async () => {
    const items = [
      docketItem({ metadata: {} }),
      docketItem({ metadata: { caseId: 'notcl:123' } }),
      docketItem({ metadata: { caseId: 'cl:abc' } }),
      docketItem({ metadata: { caseId: 'cl:12345678901' } }), // >10 digits
      docketItem(), // the one valid item
    ];
    const count = await upsertTrackedCasesFromItems(items, 'civilLiberties');
    expect(count).toBe(1);
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('returns 0 when the DB is unavailable', async () => {
    vi.mocked(isDbAvailable).mockReturnValue(false);
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error('getDb must not be called when DB is unavailable');
    });
    const count = await upsertTrackedCasesFromItems([docketItem()], 'civilLiberties');
    expect(count).toBe(0);
  });

  it('continues past per-item DB failures and counts only successes', async () => {
    execute.mockRejectedValueOnce(new Error('deadlock')).mockResolvedValueOnce({ rows: [] });
    const count = await upsertTrackedCasesFromItems(
      [docketItem(), docketItem({ metadata: { caseId: 'cl:678' } })],
      'civilLiberties',
    );
    expect(count).toBe(1);
    expect(execute).toHaveBeenCalledTimes(2);
  });
});
