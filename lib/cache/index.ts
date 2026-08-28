import Redis from 'ioredis';

let redis: Redis | null = null;

// In-memory fallback when Redis is unavailable
const memoryCache = new Map<string, { value: string; expiresAt: number }>();

function getRedis(): Redis | null {
  if (redis) return redis;

  const url = process.env.REDIS_URL;
  if (!url) return null;

  try {
    redis = new Redis(url, {
      maxRetriesPerRequest: 1,
      lazyConnect: true,
      connectTimeout: 3000,
    });

    redis.on('error', () => {
      // Silently fall back to memory cache
      redis = null;
    });

    return redis;
  } catch (err) {
    console.warn('Redis connection failed, using memory cache:', err);
    return null;
  }
}

export async function cacheGet<T>(key: string): Promise<T | null> {
  const client = getRedis();

  if (client) {
    try {
      const value = await client.get(key);
      if (value) return JSON.parse(value) as T;
      return null;
    } catch (err) {
      console.warn('Redis GET failed, falling back to memory cache:', err);
    }
  }

  // Memory fallback
  const entry = memoryCache.get(key);
  if (entry && entry.expiresAt > Date.now()) {
    return JSON.parse(entry.value) as T;
  }
  if (entry) {
    memoryCache.delete(key);
  }
  return null;
}

export async function cacheSet(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  const serialized = JSON.stringify(value);
  const client = getRedis();

  if (client) {
    try {
      await client.set(key, serialized, 'EX', ttlSeconds);
      return;
    } catch (err) {
      console.warn('Redis SET failed, falling back to memory cache:', err);
    }
  }

  // Memory fallback
  memoryCache.set(key, {
    value: serialized,
    expiresAt: Date.now() + ttlSeconds * 1000,
  });
}

/** Delete a key (used by short-lived coordination markers, #729). */
export async function cacheDel(key: string): Promise<void> {
  const client = getRedis();
  if (client) {
    try {
      await client.del(key);
      return;
    } catch (err) {
      console.warn('Redis DEL failed, falling back to memory cache:', err);
    }
  }
  memoryCache.delete(key);
}

/**
 * Atomically increment a fixed-window counter and return the new count, or
 * null when Redis is unavailable (caller falls back to a per-process limiter).
 * EXPIRE is set on the first hit of a window so the counter self-resets;
 * shared across web instances, unlike the in-memory limiter (#615).
 */
export async function rateLimitHit(key: string, windowSeconds: number): Promise<number | null> {
  const client = getRedis();
  if (!client) return null;
  try {
    const count = await client.incr(key);
    if (count === 1) await client.expire(key, windowSeconds);
    return count;
  } catch (err) {
    console.warn('Redis rate-limit INCR failed, falling back:', err);
    return null;
  }
}

const memoryCounters = new Map<string, { count: number; expiresAt: number }>();

/**
 * Adjust a shared counter by `delta` (floored at 0), refreshing its TTL, and
 * return the new value (#793). Redis-backed across instances; per-process
 * memory fallback when Redis is unavailable — good enough for a
 * concurrency slot, which only needs to be right within one process then.
 */
export async function counterAdjust(
  key: string,
  delta: number,
  ttlSeconds: number,
): Promise<number> {
  const client = getRedis();
  if (client) {
    try {
      const count = await client.incrby(key, delta);
      if (count < 0) await client.set(key, '0', 'EX', ttlSeconds);
      else await client.expire(key, ttlSeconds);
      return Math.max(0, count);
    } catch (err) {
      console.warn('Redis INCRBY failed, falling back to memory counter:', err);
    }
  }
  const now = Date.now();
  const entry = memoryCounters.get(key);
  const base = entry && entry.expiresAt > now ? entry.count : 0;
  const count = Math.max(0, base + delta);
  memoryCounters.set(key, { count, expiresAt: now + ttlSeconds * 1000 });
  return count;
}
