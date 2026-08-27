/** Delay execution for the given number of milliseconds. */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Map over items with bounded concurrency.
 * Runs up to `concurrency` tasks in parallel; returns results in input order.
 */
export async function mapConcurrent<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      results[idx] = await fn(items[idx]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

const inFlight = new Map<string, Promise<unknown>>();

/**
 * In-flight dedupe (#782 WO-5): concurrent callers with the same key share
 * ONE invocation of `fn`; the entry clears when it settles, so the next call
 * after completion runs fresh (the caller's own result cache decides
 * whether that is a hit). Rejections propagate to every joiner. Process-
 * local — it coalesces work inside one server instance, not across them.
 */
export function singleflight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const pending = inFlight.get(key);
  if (pending) return pending as Promise<T>;
  const run = fn().finally(() => {
    if (inFlight.get(key) === run) inFlight.delete(key);
  });
  inFlight.set(key, run);
  return run;
}

/** A bounded-concurrency gate shared across callers (#782 WO-5): at most
 *  `limit` wrapped functions run at once; the rest queue FIFO. `limit <= 0`
 *  returns a pass-through, so an unset knob costs nothing. */
export function createLimiter(limit: number): <T>(fn: () => Promise<T>) => Promise<T> {
  if (limit <= 0) return (fn) => fn();
  let active = 0;
  const waiters: Array<() => void> = [];
  const release = () => {
    active -= 1;
    waiters.shift()?.();
  };
  return async (fn) => {
    if (active >= limit) await new Promise<void>((resolve) => waiters.push(resolve));
    active += 1;
    try {
      return await fn();
    } finally {
      release();
    }
  };
}

/**
 * mapConcurrent with a stop condition checked before each item starts
 * (#788): items not started once `shouldStop()` is true are skipped, so a
 * time-budgeted job ends promptly without abandoning in-flight work.
 * Returns results in input order (`undefined` for skipped items) and the
 * skipped count.
 */
export async function mapConcurrentUntil<T, R>(
  items: T[],
  concurrency: number,
  shouldStop: () => boolean,
  fn: (item: T) => Promise<R>,
): Promise<{ results: Array<R | undefined>; skipped: number }> {
  const results: Array<R | undefined> = new Array(items.length);
  let nextIndex = 0;
  let skipped = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const idx = nextIndex++;
      if (shouldStop()) {
        skipped += 1;
        continue;
      }
      results[idx] = await fn(items[idx]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return { results, skipped };
}
