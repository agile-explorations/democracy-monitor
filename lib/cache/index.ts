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
