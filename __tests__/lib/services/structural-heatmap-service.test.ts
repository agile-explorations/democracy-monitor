import { describe, expect, it } from 'vitest';
import { detectStandoutRuns } from '@/lib/services/structural-heatmap-service';

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
