import { describe, expect, it, vi } from 'vitest';
import { CPD_TRAILING_WINDOW_DAYS, groupByCategoryWeek } from '@/lib/cron/snapshot-cpd';

vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn().mockReturnValue(false),
  getDb: vi.fn(),
}));

describe('snapshot-cpd (#798)', () => {
  it("looks back far enough to cover GPO's measured ~7-week load lag", () => {
    expect(CPD_TRAILING_WINDOW_DAYS).toBeGreaterThanOrEqual(90);
  });

  it('groups new documents by (category, week) for L2 + aggregation', () => {
    const groups = groupByCategoryWeek([
      {
        item: { title: 'Remarks', pubDate: '2026-04-07', content: 'x' },
        categories: ['executiveActions', 'fiscal'],
        unmappedSubjects: [],
      },
      {
        item: { title: 'Letter', pubDate: '2026-04-09', content: 'y' },
        categories: ['executiveActions'],
        unmappedSubjects: [],
      },
      {
        item: { title: 'Proclamation', pubDate: '2026-04-14', content: 'z' },
        categories: ['executiveActions'],
        unmappedSubjects: [],
      },
    ]);
    expect([...groups.keys()].sort()).toEqual([
      'executiveActions|2026-04-06',
      'executiveActions|2026-04-13',
      'fiscal|2026-04-06',
    ]);
    expect(groups.get('executiveActions|2026-04-06')).toHaveLength(2);
  });
});
