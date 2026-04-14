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

/** Get combined date range across all baseline configs for an administration.
 *  The `from` date is aligned to the Monday of inauguration week so the query
 *  captures the first weekly aggregate (which uses Monday-based week_of dates). */
export function getPeriodRange(administration: string): { from: string; to: string } | null {
  const configs = BASELINE_CONFIGS.filter((c) => c.administration === administration);
  if (configs.length === 0) return null;
  let from = configs[0].from;
  let to = configs[0].to;
  for (const c of configs) {
    if (c.from < from) from = c.from;
    if (c.to > to) to = c.to;
  }
  // Align start to Monday so the inauguration week's aggregate is included
  const monday = toMonday(from);
  const aligned = monday.toISOString().slice(0, 10);
  return { from: aligned, to };
}

/** Get the Monday of the week containing a date. */
function toMonday(dateStr: string): Date {
  const d = new Date(dateStr + 'T00:00:00Z');
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Sunday=6 back, else day-1 back
  d.setUTCDate(d.getUTCDate() - diff);
  return d;
}

/** Compute week offset (0-based) from a period start date, aligned to Monday weeks. */
export function weekOffset(weekDate: string, periodStart: string): number {
  const d = toMonday(weekDate);
  const s = toMonday(periodStart);
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
