import type { NextApiRequest, NextApiResponse } from 'next';
import { rateLimitHit } from '@/lib/cache';

interface RateLimitOptions {
  windowMs: number;
  maxRequests: number;
}

interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

/** Named rate-limit policies for the public request surface (#615). */
export const RATE_LIMITS = {
  // Search hits paid AI (embed + rerank + Sonnet synthesis) + heavy pgvector.
  search: { windowMs: 5 * 60_000, maxRequests: 20, keyPrefix: 'rl:search' },
  // Email-send endpoints: block confirmation-spam / quota exhaustion.
  email: { windowMs: 60 * 60_000, maxRequests: 5, keyPrefix: 'rl:email' },
} as const;

type RateLimitPolicy = { windowMs: number; maxRequests: number; keyPrefix: string };

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

/**
 * Extract the client IP. Behind Cloudflare the true client IP is in
 * CF-Connecting-IP; x-forwarded-for's first hop would otherwise be a
 * Cloudflare edge IP, collapsing every visitor into one rate-limit bucket.
 */
export function getClientIp(req: NextApiRequest): string {
  const cf = req.headers['cf-connecting-ip'];
  if (typeof cf === 'string' && cf.trim()) return cf.trim();
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress ?? 'unknown';
}

/**
 * Redis-backed fixed-window rate limiter, shared across web instances. Falls
 * back to the per-process sliding-window limiter when Redis is down, so a
 * Redis outage degrades protection rather than removing it (#615).
 */
export async function checkRateLimitShared(
  ip: string,
  policy: RateLimitPolicy,
): Promise<RateLimitResult> {
  const windowSeconds = Math.ceil(policy.windowMs / 1000);
  const count = await rateLimitHit(`${policy.keyPrefix}:${ip}`, windowSeconds);
  if (count === null) {
    // Redis unavailable — degrade to the in-memory limiter.
    return checkRateLimit(`${policy.keyPrefix}:${ip}`, policy);
  }
  if (count > policy.maxRequests) {
    return { allowed: false, retryAfterMs: policy.windowMs };
  }
  return { allowed: true, retryAfterMs: 0 };
}

/**
 * Enforce a rate-limit policy on an API request. Returns true when allowed;
 * when blocked it sends a 429 with Retry-After and returns false, so callers
 * write `if (!(await enforceRateLimit(req, res, RATE_LIMITS.search))) return;`.
 */
export async function enforceRateLimit(
  req: NextApiRequest,
  res: NextApiResponse,
  policy: RateLimitPolicy,
): Promise<boolean> {
  const { allowed, retryAfterMs } = await checkRateLimitShared(getClientIp(req), policy);
  if (!allowed) {
    res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000));
    res.status(429).json({ error: 'Rate limit exceeded. Please slow down.' });
    return false;
  }
  return true;
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
