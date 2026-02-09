import type { NextApiRequest } from 'next';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

const requestLog = new Map<string, number[]>();

/** Sliding-window rate limiter. Returns whether the request is allowed. */
export function checkRateLimit(
  ip: string,
  { windowMs, maxRequests }: RateLimitOptions,
): RateLimitResult {
  const now = Date.now();
  const timestamps = requestLog.get(ip) ?? [];

  // Remove timestamps outside the window
  const windowStart = now - windowMs;
  const recent = timestamps.filter((t) => t > windowStart);

  if (recent.length >= maxRequests) {
    const oldest = recent[0];
    const retryAfterMs = oldest + windowMs - now;
    requestLog.set(ip, recent);
    return { allowed: false, retryAfterMs: Math.max(0, retryAfterMs) };
  }

  recent.push(now);
  requestLog.set(ip, recent);
  return { allowed: true, retryAfterMs: 0 };
}

/** Extract client IP from a Next.js API request. */
export function getClientIp(req: NextApiRequest): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

// Periodic cleanup of stale entries (every 60 seconds)
const CLEANUP_INTERVAL_MS = 60_000;
const MAX_WINDOW_MS = 60_000; // Assume max window is 60s for cleanup

let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function startCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const cutoff = Date.now() - MAX_WINDOW_MS;
    for (const [ip, timestamps] of requestLog) {
      const recent = timestamps.filter((t) => t > cutoff);
      if (recent.length === 0) {
        requestLog.delete(ip);
      } else {
        requestLog.set(ip, recent);
      }
    }
  }, CLEANUP_INTERVAL_MS);
  // Allow process to exit even if timer is running
  if (cleanupTimer && typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
    cleanupTimer.unref();
  }
}

startCleanup();

/** Reset all rate limit state (for testing). */
export function _resetRateLimiter(): void {
  requestLog.clear();
}
