import { cacheGet, cacheSet } from '@/lib/cache';
import { getFallbackConfig } from '@/lib/data/fallback-sources';
import type { FallbackSource, FallbackResult } from '@/lib/types/resilience';

const FETCH_TIMEOUT_MS = 15000;

async function fetchWithTimeout(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function trySource(source: FallbackSource): Promise<unknown | null> {
  try {
    const res = await fetchWithTimeout(source.url);
    if (!res.ok) return null;

    const contentType = res.headers.get('content-type') || '';

    if (source.parser === 'json' || contentType.includes('json')) {
      return await res.json();
    }
    // For RSS and HTML, return raw text for caller to parse
    return await res.text();
  } catch {
    return null;
  }
}

export async function fetchWithFallback(
  category: string,
  cacheTtlSeconds = 3600,
): Promise<FallbackResult | null> {
  const cacheKey = `fallback:${category}`;
  const cached = await cacheGet<FallbackResult>(cacheKey);
  if (cached) return cached;

  const config = getFallbackConfig(category);
  if (!config) return null;

  // Sort by priority: primary → watchdog → archive
  const priority: Record<string, number> = { primary: 0, watchdog: 1, archive: 2 };
  const sorted = [...config.sources].sort(
    (a, b) => (priority[a.type] ?? 9) - (priority[b.type] ?? 9),
  );

  for (const source of sorted) {
    const data = await trySource(source);
    if (data !== null) {
      const confidence = source.type === 'primary' ? 1.0 : source.type === 'watchdog' ? 0.7 : 0.4;

      const result: FallbackResult = {
        data,
        source,
        sourceType: source.type,
        confidence,
        fallbackUsed: source.type !== 'primary',
      };

      await cacheSet(cacheKey, result, cacheTtlSeconds);
      return result;
    }
  }

  return null;
}
