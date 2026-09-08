/**
 * R-TIPWIRE-3 coverage check (#861, #865): after a `tip` verdict, ask GDELT
 * DOC 2.0 whether the tip's identifier-grade search keys already have news
 * coverage. The result informs the operator (a graded digest line with
 * sample URLs) and is NEVER asserted to a reporter.
 *
 * Fail-safe by construction: the throttle body ("Please limit requests…"),
 * a 429, a timeout, non-JSON, or the per-run cap all mark the key as failed,
 * and a check with no positive hit and any failure is `not-checkable` —
 * never a hollow zero. Calls are serialized ≥ GDELT_MIN_SPACING_MS apart.
 */

import {
  COVERAGE_WINDOW_DAYS,
  NICHE_MAX_HITS,
  isNationalOutlet,
} from '@/lib/data/coverage-outlets';
import type { TipCoverageCheck } from '@/lib/db/schema';
import { formatError } from '@/lib/utils/api-helpers';
import { TIPWIRE_UA } from './acquire';

export const GDELT_MIN_SPACING_MS = 6_000;
/** GDELT answers slowly under load — a valid artlist took 25 s from the laptop on
 *  2026-09-08 while the 10 s abort read it as unavailable (#867). Worst case per
 *  poll: GDELT_MAX_CALLS_PER_RUN × (this + spacing) ≈ 26 min, all fail-safe. */
export const GDELT_TIMEOUT_MS = 45_000;
export const GDELT_MAX_KEYS_PER_TIP = 3;
/** One poll per day, so per-run ≈ per-day for the cron (6 reporters × ~4 tips × 3 keys ≈ 24). */
export const GDELT_MAX_CALLS_PER_RUN = 30;
export const GDELT_MAX_RECORDS = 25;
const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';
const SAMPLE_URLS_PER_KEY = 3;
const KEY_MIN_CHARS = 4;
const KEY_MAX_CHARS = 80;

export type CoverageKeyResult = TipCoverageCheck['keys'][number];

export interface CoverageDeps {
  /** Raw response body for a URL (any status); throws on network failure. */
  fetchText: (url: string) => Promise<string>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  maxCalls: number;
}

/** `excludeUrls`: the anchor article itself (forward/contradiction) — GDELT indexes it too,
 *  and a tip is never "covered" by the piece it follows up. Outlet-wide drops are gone (#874). */
export type CoverageChecker = (
  searchKeys: string[],
  excludeUrls?: readonly string[],
) => Promise<TipCoverageCheck>;

export function gdeltUrl(key: string, windowDays = COVERAGE_WINDOW_DAYS): string {
  const params = new URLSearchParams({
    query: `"${key.replace(/"/g, '').trim()}"`,
    mode: 'artlist',
    maxrecords: String(GDELT_MAX_RECORDS),
    format: 'json',
    timespan: `${windowDays}d`,
  });
  return `${GDELT_DOC_API}?${params.toString()}`;
}

/** Identifier-grade: a number/date/docket, a case caption, or a multi-word proper name.
 *  Paraphrasable phrases ("workplace discrimination") are rejected — a zero
 *  for those would be meaningless. */
export function isIdentifierGrade(key: string): boolean {
  const k = key.trim();
  if (k.length < KEY_MIN_CHARS || k.length > KEY_MAX_CHARS) return false;
  if (/\d/.test(k)) return true;
  if (/\bv\.?\s/i.test(k)) return true;
  const capitalised = k.split(/\s+/).filter((t) => /^[A-Z][A-Za-z'’./&-]+$/.test(t));
  return capitalised.length >= 2;
}

/** Search keys worth querying, in order, capped. */
export function selectKeys(searchKeys: string[]): string[] {
  return [...new Set(searchKeys.map((k) => k.trim()))]
    .filter(isIdentifierGrade)
    .slice(0, GDELT_MAX_KEYS_PER_TIP);
}

export interface ParsedArtlist {
  urls: string[];
}

/** GDELT artlist body → article URLs; null for the throttle text, a 429 page,
 *  or anything without an `articles` array. */
export function parseGdeltArtlist(body: string): ParsedArtlist | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const articles = (parsed as { articles?: unknown }).articles;
  if (!Array.isArray(articles)) return null;
  const urls = articles
    .map((a) => (a && typeof a === 'object' ? (a as { url?: unknown }).url : undefined))
    .filter((u): u is string => typeof u === 'string' && u.length > 0);
  return { urls };
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** host + path, so feed and GDELT spellings of one article (query string, scheme) agree. */
function canonical(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/** Every valid URL counts except the anchor article itself; per-host URLs let the digest split own outlet from others. */
export function summarizeHits(
  urls: string[],
  excludeUrls: readonly string[] = [],
): Omit<CoverageKeyResult, 'key'> {
  const excluded = new Set(excludeUrls.map(canonical).filter((c): c is string => c !== null));
  const hitsByDomain: Record<string, string[]> = {};
  const valid: string[] = [];
  let nationalHit = false;
  for (const u of urls) {
    const h = hostOf(u);
    if (h === null) continue;
    const c = canonical(u);
    if (c !== null && excluded.has(c)) continue;
    valid.push(u);
    if (isNationalOutlet(h)) nationalHit = true;
    (hitsByDomain[h] ??= []).push(u);
  }
  return {
    hits: valid.length,
    sampleUrls: valid.slice(0, SAMPLE_URLS_PER_KEY),
    nationalHit,
    hitsByDomain,
  };
}

export function labelCoverage(keys: CoverageKeyResult[]): TipCoverageCheck['label'] {
  const ok = keys.filter((k) => !k.error);
  const hits = ok.reduce((n, k) => n + k.hits, 0);
  if (ok.length === 0 || (hits === 0 && ok.length < keys.length)) return 'not-checkable';
  if (hits === 0) return 'checkable-zero';
  const national = ok.some(
    (k) =>
      k.nationalHit ??
      k.sampleUrls.some((u) => {
        const h = hostOf(u);
        return h !== null && isNationalOutlet(h);
      }),
  );
  if (national) return 'likely-covered';
  return hits <= NICHE_MAX_HITS ? 'niche' : 'likely-covered';
}

async function fetchGdeltText(url: string): Promise<string> {
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': TIPWIRE_UA },
    signal: AbortSignal.timeout(GDELT_TIMEOUT_MS),
  });
  return res.text();
}

function defaultDeps(): CoverageDeps {
  return {
    fetchText: fetchGdeltText,
    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
    now: () => Date.now(),
    maxCalls: GDELT_MAX_CALLS_PER_RUN,
  };
}

/** One checker per run: it owns the spacing clock and the call counter. */
export function createCoverageChecker(deps: Partial<CoverageDeps> = {}): CoverageChecker {
  const d = { ...defaultDeps(), ...deps };
  let calls = 0;
  let lastCallAt = Number.NEGATIVE_INFINITY;

  async function queryKey(key: string, excludeUrls: readonly string[]): Promise<CoverageKeyResult> {
    if (calls >= d.maxCalls) return { key, hits: 0, sampleUrls: [], error: 'run cap reached' };
    const wait = lastCallAt + GDELT_MIN_SPACING_MS - d.now();
    if (wait > 0) await d.sleep(wait);
    calls++;
    lastCallAt = d.now();
    try {
      const parsed = parseGdeltArtlist(await d.fetchText(gdeltUrl(key)));
      if (!parsed) return { key, hits: 0, sampleUrls: [], error: 'throttled or invalid response' };
      return { key, ...summarizeHits(parsed.urls, excludeUrls) };
    } catch (err) {
      return {
        key,
        hits: 0,
        sampleUrls: [],
        error: formatError(err),
      };
    }
  }

  return async (searchKeys, excludeUrls = []) => {
    const keys: CoverageKeyResult[] = [];
    for (const key of selectKeys(searchKeys)) keys.push(await queryKey(key, excludeUrls));
    return {
      checkedAt: new Date(d.now()).toISOString(),
      windowDays: COVERAGE_WINDOW_DAYS,
      keys,
      label: labelCoverage(keys),
    };
  };
}

/** Reachability canary (A0, #867): one call, JSON-or-throttle, no persistence. */
export async function probeGdelt(
  fetchText: (url: string) => Promise<string> = fetchGdeltText,
): Promise<{ ok: boolean; detail: string }> {
  try {
    const body = await fetchText(gdeltUrl('Federal Register', 7));
    const parsed = parseGdeltArtlist(body);
    return parsed
      ? { ok: true, detail: `JSON, ${parsed.urls.length} article(s) for "Federal Register" in 7d` }
      : { ok: false, detail: `throttled/invalid: ${body.slice(0, 100).replace(/\s+/g, ' ')}` };
  } catch (err) {
    return { ok: false, detail: formatError(err) };
  }
}
