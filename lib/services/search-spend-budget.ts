/**
 * Search spend budget (#794) — the backstop behind the pass (#792) and the
 * per-source slots (#793). Two spend units, counted at admission rather
 * than per LLM call: a `build` (embedding + expansion draws + counts +
 * rerank/judge) and a `stream` (one uncached Sonnet synthesis). Fixed UTC-day
 * windows, per source and global.
 *
 * Per-source overrun → 429 `daily_budget` (that source only). Global overrun
 * → 503 `search_paused` for builds and streams only; cached answers keep
 * serving — so the breaker pauses spend, never the site. Alerts at 50% and
 * 100% of each global unit and on a novel-build spike within an hour.
 * SEARCH_SPEND_BUDGET=off disables admission checks (counting continues).
 * Fail-open when Redis is unavailable: a backstop must not become an outage.
 */

import type { NextApiResponse } from 'next';
import { cacheGet, cacheSet, rateLimitHit } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { sendOpsAlert } from '@/lib/services/ops-alert-service';
import { envInt } from '@/lib/utils/env';

export type SpendUnit = 'build' | 'stream';
export type SpendScope = 'source' | 'global';

export const SPEND_LIMITS: Record<SpendScope, Record<SpendUnit, number>> = {
  source: {
    build: envInt('SEARCH_SPEND_SOURCE_BUILDS', 30, 1, 100_000),
    stream: envInt('SEARCH_SPEND_SOURCE_STREAMS', 60, 1, 100_000),
  },
  global: {
    build: envInt('SEARCH_SPEND_GLOBAL_BUILDS', 600, 1, 1_000_000),
    stream: envInt('SEARCH_SPEND_GLOBAL_STREAMS', 1200, 1, 1_000_000),
  },
};
/** Novel builds admitted within one UTC hour that page the operator. */
export const BUILD_ALERT_PER_HOUR = envInt('SEARCH_BUILD_ALERT_PER_HOUR', 60, 1, 100_000);
export const SPEND_ALERT_FRACTION = 0.5;
/** Counters live a little past their window so a late read still sees them. */
const DAY_WINDOW_SECONDS = 26 * 3600;
const HOUR_WINDOW_SECONDS = 2 * 3600;
const ALERT_COOLDOWN_SECONDS = 26 * 3600;
const SPIKE_COOLDOWN_SECONDS = 6 * 3600;

export function budgetEnabled(): boolean {
  return process.env.SEARCH_SPEND_BUDGET !== 'off';
}

/** UTC day / hour stamps — the fixed-window keys. Pure. */
export function dayStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}
export function hourStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 13);
}
/** Seconds until the UTC day rolls — the Retry-After for a daily budget. Pure. */
export function secondsToNextDay(now: Date = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

export type SpendVerdict =
  | { ok: true }
  | { ok: false; scope: 'global'; code: 'search_paused' }
  | { ok: false; scope: 'source'; code: 'daily_budget' };

/** Global first (it protects everyone), then the source. Pure. */
export function evaluateBudget(
  counts: Record<SpendScope, number>,
  limits: Record<SpendScope, number>,
): SpendVerdict {
  if (counts.global > limits.global) return { ok: false, scope: 'global', code: 'search_paused' };
  if (counts.source > limits.source) return { ok: false, scope: 'source', code: 'daily_budget' };
  return { ok: true };
}

/** The alert level a global count crossed on this increment, if any. Pure. */
export function crossedLevel(count: number, limit: number): '50%' | '100%' | null {
  if (count === limit) return '100%';
  if (count === Math.ceil(limit * SPEND_ALERT_FRACTION)) return '50%';
  return null;
}

async function alertOnce(
  cooldownKey: string,
  cooldownSeconds: number,
  subject: string,
  details: string[],
) {
  if (await cacheGet<boolean>(cooldownKey)) return;
  await cacheSet(cooldownKey, true, cooldownSeconds);
  await sendOpsAlert(subject, details);
}

/** Count one admitted unit for the source and globally; return the verdict.
 *  Alerts fire on threshold crossings (counts only — never query text). */
export async function admitSpend(
  unit: SpendUnit,
  sourceId: string,
  now: Date = new Date(),
): Promise<SpendVerdict> {
  const day = dayStamp(now);
  const [source, global] = await Promise.all([
    rateLimitHit(CacheKeys.searchSpend(unit, sourceId, day), DAY_WINDOW_SECONDS),
    rateLimitHit(CacheKeys.searchSpend(unit, 'global', day), DAY_WINDOW_SECONDS),
  ]);
  if (unit === 'build') void trackBuildSpike(now);
  if (source == null || global == null) return { ok: true }; // Redis down: backstop yields
  const limit = SPEND_LIMITS.global[unit];
  const level = crossedLevel(global, limit);
  if (level) {
    void alertOnce(
      CacheKeys.opsSpendAlert(unit, level, day),
      ALERT_COOLDOWN_SECONDS,
      `Search spend: ${unit}s at ${level} of the daily global budget`,
      [
        `Unit: ${unit}`,
        `Global count today (UTC ${day}): ${global} of ${limit}`,
        level === '100%'
          ? 'Novel builds/streams are now paused (503 search_paused) until the UTC day rolls; cached answers keep serving. Set SEARCH_SPEND_BUDGET=off to lift.'
          : 'Informational — no action taken.',
      ],
    );
  }
  if (!budgetEnabled()) return { ok: true };
  return evaluateBudget({ source, global }, { source: SPEND_LIMITS.source[unit], global: limit });
}

async function trackBuildSpike(now: Date): Promise<void> {
  const hour = hourStamp(now);
  const count = await rateLimitHit(CacheKeys.opsBuildsHour(hour), HOUR_WINDOW_SECONDS);
  if (count !== BUILD_ALERT_PER_HOUR) return;
  await alertOnce(
    CacheKeys.opsBuildSpikeAlert(),
    SPIKE_COOLDOWN_SECONDS,
    `Search: ${count} novel builds this hour`,
    [
      `Hour (UTC): ${hour}`,
      `Novel builds admitted: ${count} (alert threshold ${BUILD_ALERT_PER_HOUR})`,
      'Possible scripted traffic; the pass (#792), per-source slots (#793) and daily budgets (#794) are in force. Check /api/health/search-timings?days=1.',
    ],
  );
}

/** Write the budget rejection (Retry-After to the UTC day roll). */
export function respondSpend(
  res: NextApiResponse,
  verdict: Exclude<SpendVerdict, { ok: true }>,
  now: Date = new Date(),
): void {
  const retryAfter = secondsToNextDay(now);
  res.setHeader('Retry-After', retryAfter);
  if (verdict.code === 'search_paused') {
    res.status(503).json({
      error:
        'New searches are paused for today to stay within budget — cached answers are still available.',
      code: 'search_paused',
      retryAfterMs: retryAfter * 1000,
    });
    return;
  }
  res.status(429).json({
    error: 'This session has reached its daily search budget. Please try again tomorrow.',
    code: 'daily_budget',
    retryAfterMs: retryAfter * 1000,
  });
}

/** Today's global counts vs limits — for the ops health endpoint. */
export async function readBudgetStatus(now: Date = new Date()) {
  const day = dayStamp(now);
  const read = async (unit: SpendUnit) => ({
    count: (await cacheGet<number>(CacheKeys.searchSpend(unit, 'global', day))) ?? 0,
    limit: SPEND_LIMITS.global[unit],
  });
  const [build, stream] = await Promise.all([read('build'), read('stream')]);
  return {
    day,
    enabled: budgetEnabled(),
    build,
    stream,
    paused: { build: build.count > build.limit, stream: stream.count > stream.limit },
  };
}
