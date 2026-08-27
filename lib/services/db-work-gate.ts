/**
 * Database work gate (#782 WO-5).
 *
 * Stage overlap lets one build's alias arms, vector queries and mined
 * validation run at the same time (expansion runs first, alone). On the 2-vCPU basic-4gb
 * tier the database saturates near 8 concurrent statements: ungated
 * overlap re-queued the same I/O (vectors 2x slower beside counts; three
 * era windows expanding in parallel slower than serial), while a
 * PROCESS-WIDE cap of 8 fixed single-window builds but throttled the era
 * path, which had always run its windows side by side (~24 statements).
 *
 * So the budget is PER REQUEST, sized by window count: 8 statements per
 * window — exactly the envelope each path had before the overlap, with
 * the within-window pipelining kept. Carried by AsyncLocalStorage so the
 * arm/count/vector call sites need no plumbing and work outside any
 * request (prewarm, replay, CLI) stays ungated as before.
 */

import { AsyncLocalStorage } from 'async_hooks';
import { createLimiter } from '@/lib/utils/async';
import { envInt } from '@/lib/utils/env';

type Gate = <T>(fn: () => Promise<T>) => Promise<T>;

/** Per-request cache telemetry (#787): how much of a build's arm and
 *  validation-count work the week's caches absorbed. */
export interface CacheStats {
  armHits: number;
  armMisses: number;
  countHits: number;
  countMisses: number;
}

interface RequestContext {
  gate: Gate;
  stats: CacheStats;
}

/** Concurrent DB statements one research window may hold — the WO-3
 *  per-stage setting, now applied to the window's stages combined. */
export const DB_CONCURRENCY_PER_WINDOW = envInt('DB_CONCURRENCY_PER_WINDOW', 8, 1, 16);

/** Optional process-wide ceiling across all requests (0 = off). Kept as
 *  an incident/sweep knob; the measured default is no global cap. */
const DB_WORK_CONCURRENCY = envInt('DB_WORK_CONCURRENCY', 0, 0, 32);
const processGate: Gate = createLimiter(DB_WORK_CONCURRENCY);

const requestContext = new AsyncLocalStorage<RequestContext>();

/** Run `fn` under a fresh per-request budget of `perWindow × windows`
 *  concurrent statements (and a fresh cache tally). Everything awaited
 *  inside inherits both. */
export function withRequestDbGate<T>(
  windows: number,
  fn: () => Promise<T>,
  perWindow: number = DB_CONCURRENCY_PER_WINDOW,
): Promise<T> {
  const context: RequestContext = {
    gate: createLimiter(perWindow * Math.max(1, windows)),
    stats: { armHits: 0, armMisses: 0, countHits: 0, countMisses: 0 },
  };
  return requestContext.run(context, fn);
}

/** Acquire the current request's gate (if any) and the process gate (if
 *  configured) around one DB statement. Pass-through when neither is set. */
export function dbWorkGate<T>(fn: () => Promise<T>): Promise<T> {
  const request = requestContext.getStore();
  return processGate(() => (request ? request.gate(fn) : fn()));
}

/** Record a cache hit or miss for the current request; no-op outside one
 *  (prewarm, replay, CLI). */
export function noteCacheEvent(kind: 'arm' | 'count', hit: boolean): void {
  const request = requestContext.getStore();
  if (!request) return;
  const key = `${kind}${hit ? 'Hits' : 'Misses'}` as keyof CacheStats;
  request.stats[key] += 1;
}

/** Snapshot of the current request's tally; undefined outside a request. */
export function requestCacheStats(): CacheStats | undefined {
  const request = requestContext.getStore();
  return request ? { ...request.stats } : undefined;
}

/** Hit rate per kind in [0,1], or null when that kind did no work. Pure. */
export function cacheHitRate(stats: CacheStats): { arms: number | null; counts: number | null } {
  const rate = (hits: number, misses: number) =>
    hits + misses === 0 ? null : hits / (hits + misses);
  return {
    arms: rate(stats.armHits, stats.armMisses),
    counts: rate(stats.countHits, stats.countMisses),
  };
}
