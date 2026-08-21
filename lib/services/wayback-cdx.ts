/**
 * Generic Wayback Machine CDX helpers (#739) — extracted from
 * dhs-press-archive.ts (#605) so GAO ingest and future archive-sourced
 * fetchers share one client. dhs-press-archive re-exports these, so its
 * call sites and tests are unchanged.
 *
 * Live-measured behavior the constants encode: limit=20000 504s at the CDX
 * gateway (~60s) while limit=3000 answers in ~25s; sustained pagination is
 * shed with 503s/empty replies and needs linear backoff, not speed.
 *
 * I/O module — coverage-excluded; parseCdxResponse/normalizeCdxUrl are pure
 * and tested in __tests__/lib/services/wayback-cdx.test.ts.
 */

import { sleep } from '@/lib/utils/async';

const FETCH_TIMEOUT_MS = 45_000;
export const CDX_DELAY_MS = 3_000;
const CDX_PAGE_LIMIT = 3_000;
const CDX_TIMEOUT_MS = 120_000;
const MAX_CDX_REQUESTS = 60;

const FETCH_MAX_ATTEMPTS = 5;
const FETCH_RETRY_BASE_MS = 8_000;

export const WAYBACK_USER_AGENT = 'DemocracyMonitor/1.0 (civic monitoring)';

/** Fetch with linear-backoff retries — enumeration endpoints throw transient
 * connect timeouts (observed live: undici UND_ERR_CONNECT_TIMEOUT on a host
 * that answers in <100ms moments later). */
export async function fetchText(
  url: string,
  accept: string,
  timeoutMs: number = FETCH_TIMEOUT_MS,
): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': WAYBACK_USER_AGENT, Accept: accept },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`[wayback-cdx] HTTP ${response.status} for ${url}`);
      return response.text();
    } catch (err) {
      if (attempt >= FETCH_MAX_ATTEMPTS) throw err;
      const delay = FETCH_RETRY_BASE_MS * attempt;
      console.warn(
        `[wayback-cdx] attempt ${attempt}/${FETCH_MAX_ATTEMPTS} failed for ${url} (${err}), retrying in ${delay / 1000}s`,
      );
      await sleep(delay);
    }
  }
}

export interface CdxCapture {
  url: string;
  /** First-capture timestamp, YYYYMMDDhhmmss. */
  timestamp: string;
}

/**
 * Parse a CDX text response (fl=original,timestamp, showResumeKey=true).
 * The resume key, when present, follows a blank line after the data rows (pure).
 */
export function parseCdxResponse(text: string): {
  captures: CdxCapture[];
  resumeKey: string | null;
} {
  const lines = text.split('\n');
  const captures: CdxCapture[] = [];
  let resumeKey: string | null = null;
  let sawBlank = false;
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (captures.length > 0) sawBlank = true;
      continue;
    }
    if (sawBlank) {
      resumeKey = trimmed;
      break;
    }
    const [original, timestamp] = trimmed.split(/\s+/);
    if (original && /^\d{14}$/.test(timestamp ?? '')) captures.push({ url: original, timestamp });
  }
  return { captures, resumeKey };
}

/** Normalize a CDX 'original' URL to its canonical live form (https, no query) (pure). */
export function normalizeCdxUrl(url: string): string {
  return url.replace(/^http:\/\//, 'https://').split('?')[0];
}

export interface CdxWindow {
  /** Inclusive capture-time lower bound, YYYYMMDD or YYYYMMDDhhmmss. */
  from?: string;
  /** Inclusive capture-time upper bound, YYYYMMDD or YYYYMMDDhhmmss. */
  to?: string;
}

/**
 * Fetch first-capture timestamps for a URL prefix from the Wayback CDX API,
 * following resume keys. Returns a map of normalized URL → first-capture
 * timestamp (earliest wins across duplicates). `window` bounds capture time
 * server-side (the weekly-delta path: only captures new in the window).
 */
export async function fetchCdxFirstCaptures(
  urlPrefix: string,
  window?: CdxWindow,
): Promise<Map<string, string>> {
  const captures = new Map<string, string>();
  let resumeKey: string | null = null;
  for (let request = 0; request < MAX_CDX_REQUESTS; request++) {
    if (request > 0) await sleep(CDX_DELAY_MS);
    const params = new URLSearchParams({
      url: `${urlPrefix}*`,
      filter: 'statuscode:200',
      collapse: 'urlkey',
      fl: 'original,timestamp',
      limit: String(CDX_PAGE_LIMIT),
      showResumeKey: 'true',
    });
    if (window?.from) params.set('from', window.from);
    if (window?.to) params.set('to', window.to);
    if (resumeKey) params.set('resumeKey', resumeKey);
    const text = await fetchText(
      `https://web.archive.org/cdx/search/cdx?${params.toString()}`,
      'text/plain',
      CDX_TIMEOUT_MS,
    );
    const parsed = parseCdxResponse(text);
    for (const capture of parsed.captures) {
      const url = normalizeCdxUrl(capture.url);
      const existing = captures.get(url);
      if (!existing || capture.timestamp < existing) captures.set(url, capture.timestamp);
    }
    resumeKey = parsed.resumeKey;
    if (!resumeKey) break;
  }
  return captures;
}
