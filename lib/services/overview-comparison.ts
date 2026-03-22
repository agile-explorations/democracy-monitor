import { BASELINE_CONFIGS } from '@/lib/data/baselines';
import { movingAverage } from '@/lib/utils/math';

const MS_PER_WEEK = 7 * 24 * 60 * 60 * 1000;

/** Get inauguration date (cycleYear 1 start) for an administration. */
export function getInaugurationDate(administration: string): string | null {
  const config = BASELINE_CONFIGS.find(
    (c) => c.administration === administration && c.cycleYear === 1,
  );
  return config?.from ?? null;
}

/** Get combined date range across all baseline configs for an administration. */
export function getPeriodRange(administration: string): { from: string; to: string } | null {
  const configs = BASELINE_CONFIGS.filter((c) => c.administration === administration);
  if (configs.length === 0) return null;
  let from = configs[0].from;
  let to = configs[0].to;
  for (const c of configs) {
    if (c.from < from) from = c.from;
    if (c.to > to) to = c.to;
  }
  return { from, to };
}

/** Compute week offset (0-based) from a period start date. */
export function weekOffset(weekDate: string, periodStart: string): number {
  const d = new Date(weekDate + 'T00:00:00Z');
  const s = new Date(periodStart + 'T00:00:00Z');
  return Math.round((d.getTime() - s.getTime()) / MS_PER_WEEK);
}

/** Apply moving-average smoothing to scores indexed by week offset. */
export function smoothByOffset(scores: Map<number, number>, window: number): Map<number, number> {
  if (scores.size === 0) return new Map();
  const sortedOffsets = Array.from(scores.keys()).sort((a, b) => a - b);
  const values = sortedOffsets.map((o) => scores.get(o)!);
  const smoothed = movingAverage(values, window);
  const result = new Map<number, number>();
  for (let i = 0; i < sortedOffsets.length; i++) {
    result.set(sortedOffsets[i], smoothed[i]);
  }
  return result;
}
