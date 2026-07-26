import { describe, expect, it } from 'vitest';
import { buildMarkersByWeek } from '@/lib/data/instrument-changes';
import {
  detectStandoutRuns,
  orderRowsByRecentHeat,
} from '@/lib/services/structural-heatmap-service';

describe('detectStandoutRuns (#575)', () => {
  const week = (w: string, z: number | null) => ({
    week: w,
    dimensions: { volume: z } as Record<string, number | null>,
    composite: null,
    anomalous: false,
  });
  const row = (weeks: ReturnType<typeof week>[]) =>
    ({ category: 'military', title: 'Using Military Inside the U.S.', weeks }) as any;

  it('detects a sustained run and renders a sentence with direction', () => {
    const runs = detectStandoutRuns([
      row([week('2026-01-05', 3), week('2026-01-12', 2.8), week('2026-01-19', 4.1)]),
    ]);
    expect(runs).toHaveLength(1);
    expect(runs[0].weekCount).toBe(3);
    expect(runs[0].direction).toBe('above');
    expect(runs[0].sentence).toContain('well above');
    expect(runs[0].sentence).toContain('3 straight weeks');
  });

  it('ignores runs shorter than three weeks and breaks on null weeks', () => {
    const runs = detectStandoutRuns([
      row([
        week('2026-01-05', 3),
        week('2026-01-12', null),
        week('2026-01-19', 3),
        week('2026-01-26', 3),
      ]),
    ]);
    expect(runs).toHaveLength(0);
  });

  it('splits runs when the sign flips', () => {
    const runs = detectStandoutRuns([
      row([
        week('2026-01-05', 3),
        week('2026-01-12', 3),
        week('2026-01-19', 3),
        week('2026-01-26', -3),
        week('2026-02-02', -3),
        week('2026-02-09', -3),
      ]),
    ]);
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.direction).sort()).toEqual(['above', 'below']);
  });

  it('ranks by duration times magnitude and caps at eight', () => {
    const long = row(
      Array.from({ length: 10 }, (_, i) => week(`2026-03-${String(i + 1).padStart(2, '0')}`, 2.6)),
    );
    const short = row([week('2026-01-05', 4), week('2026-01-12', 4), week('2026-01-19', 4)]);
    const runs = detectStandoutRuns([long, short]);
    expect(runs[0].weekCount).toBe(10);
  });
});

describe('instrument-change suppression + ordering (#576/#577)', () => {
  const week = (w: string, z: number | null, composite: number | null = null) => ({
    week: w,
    dimensions: { volume: z } as Record<string, number | null>,
    composite,
    anomalous: false,
  });

  it('suppresses below-baseline runs overlapping an instrument change for the category', () => {
    const clQuiet = {
      category: 'civilLiberties',
      title: 'Civil Rights & Liberties',
      weeks: [week('2026-03-02', -3), week('2026-03-09', -3), week('2026-03-16', -3)],
    } as any;
    expect(detectStandoutRuns([clQuiet])).toHaveLength(0);
  });

  it('keeps above-baseline runs even across instrument changes', () => {
    const clBusy = {
      category: 'civilLiberties',
      title: 'Civil Rights & Liberties',
      weeks: [week('2026-03-02', 3), week('2026-03-09', 3), week('2026-03-16', 3)],
    } as any;
    expect(detectStandoutRuns([clBusy])).toHaveLength(1);
  });

  it('orders rows by trailing mean |composite|', () => {
    const hot = { category: 'a', title: 'A', weeks: [week('2026-01-05', null, 3)] } as any;
    const cool = { category: 'b', title: 'B', weeks: [week('2026-01-05', null, 0.2)] } as any;
    expect(orderRowsByRecentHeat([cool, hot]).map((r) => r.category)).toEqual(['a', 'b']);
  });
});

describe('buildMarkersByWeek surface scoping (#584 rework)', () => {
  const changes = [
    {
      date: '2026-02-02',
      label: 'volume-only change',
      retroactive: false,
      affectsConcernStatuses: false,
    },
    {
      date: '2026-03-02',
      label: 'status-breaking change',
      retroactive: false,
      affectsConcernStatuses: true,
    },
    {
      date: '2026-04-06',
      label: 'retroactive change',
      retroactive: true,
      affectsConcernStatuses: false,
    },
  ];
  const weeks = ['2026-01-26', '2026-02-02', '2026-03-02', '2026-04-06'];

  it('volume surfaces mark every non-retroactive change', () => {
    const map = buildMarkersByWeek(weeks, { changes });
    expect([...map.keys()].sort()).toEqual(['2026-02-02', '2026-03-02']);
  });

  it('status surfaces mark only status-breaking changes', () => {
    const map = buildMarkersByWeek(weeks, { changes, statusSurface: true });
    expect([...map.keys()]).toEqual(['2026-03-02']);
  });
});
