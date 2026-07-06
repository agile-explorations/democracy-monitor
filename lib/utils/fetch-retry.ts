import { sleep } from '@/lib/utils/async';

interface FetchRetryOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  label?: string;
  /**
   * Per-attempt timeout. A fresh AbortSignal.timeout is created for each attempt
   * (a single reused signal would be pre-aborted on retry), so a hung request
   * aborts and is retried like any other network error.
   */
  timeoutMs?: number;
}

/** Status codes that should trigger a retry. */
function isRetryableStatus(status: number): boolean {
  return status >= 500 || status === 429;
}

/**
 * Wraps `globalThis.fetch` with configurable retry logic.
 *
 * - Retries on 5xx and 429 (rate limit) responses
 * - Retries on network errors (TypeError from fetch)
 * - Returns immediately on 4xx (client error, no retry)
 * - On final failed attempt: returns the error response (does not throw)
 * - On final network error: throws the original error
 */
export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  options?: FetchRetryOptions,
): Promise<Response> {
  const maxAttempts = options?.maxAttempts ?? 3;
  const baseDelayMs = options?.baseDelayMs ?? 2000;
  const label = options?.label ?? url.slice(0, 60);
  const timeoutMs = options?.timeoutMs;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Fresh timeout signal per attempt — a reused one would be pre-aborted on retry.
      const attemptInit = timeoutMs ? { ...init, signal: AbortSignal.timeout(timeoutMs) } : init;
      const response = await fetch(url, attemptInit);

      if (response.ok || !isRetryableStatus(response.status)) {
        return response;
      }

      // Retryable HTTP error
      if (attempt < maxAttempts) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(
          `[fetch-retry] ${label}: HTTP ${response.status}, attempt ${attempt}/${maxAttempts}, retrying in ${delayMs}ms`,
        );
        await sleep(delayMs);
        continue;
      }

      // Final attempt — return the error response for existing handlers
      console.warn(
        `[fetch-retry] ${label}: HTTP ${response.status}, all ${maxAttempts} attempts exhausted`,
      );
      return response;
    } catch (err) {
      lastError = err;

      if (attempt < maxAttempts) {
        const delayMs = baseDelayMs * Math.pow(2, attempt - 1);
        console.log(
          `[fetch-retry] ${label}: network error, attempt ${attempt}/${maxAttempts}, retrying in ${delayMs}ms`,
        );
        await sleep(delayMs);
        continue;
      }
    }
  }

  // All attempts exhausted with network errors — re-throw
  throw lastError;
}
