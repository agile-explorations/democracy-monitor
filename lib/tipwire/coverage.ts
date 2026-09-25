/**
 * Tipwire coverage check (R-TIPWIRE-3 #861, #865; provider seam R-TIPWIRE-5
 * #920): after a `tip` verdict, ask a search provider whether the tip's
 * identifier-grade search keys already have news coverage. The result informs
 * the operator (a graded digest line with sample URLs) and is NEVER asserted
 * to a reporter.
 *
 * Fail-safe by construction: a rate limit, an auth or quota error, a timeout,
 * non-JSON, or the per-run cap all mark the key as failed, and a check with no
 * positive hit and any failure is `not-checkable` — never a hollow zero. Calls
 * are serialized ≥ provider.minSpacingMs apart. Providers: ./coverage-brave
 * (the default once its key is set) and ./coverage-gdelt (dormant fallback).
 */

import {
  COVERAGE_WINDOW_DAYS,
  NICHE_MAX_HITS,
  isNationalOutlet,
  isNonCoverageHost,
  isPrimarySource,
} from '@/lib/data/coverage-outlets';
import type { TipCoverageCheck } from '@/lib/db/schema';
import { formatError } from '@/lib/utils/api-helpers';
import { TIPWIRE_UA } from './acquire';
import { BRAVE_API_KEY_ENV, createBraveProvider } from './coverage-brave';
import { GDELT_PROVIDER } from './coverage-gdelt';
import { buildQuery, classifyKey, passesTermGate } from './coverage-keys';
import type { SearchHit, SearchProvider, SearchRequest } from './coverage-provider';

export const COVERAGE_MAX_KEYS_PER_TIP = 3;
/** One poll per day, so per-run ≈ per-day for the cron (6 reporters × ~4 tips × 3 keys ≈ 24). */
export const COVERAGE_MAX_CALLS_PER_RUN = 30;
/** The per-key error a run cap leaves; the backfill re-runs checks carrying it. */
export const RUN_CAP_ERROR = 'run cap reached';
const SAMPLE_URLS_PER_KEY = 3;
const PROBE_KEY = 'Federal Register';
const PROBE_WINDOW_DAYS = 7;

export type CoverageKeyResult = TipCoverageCheck['keys'][number];
export type FetchResponse = (req: SearchRequest) => Promise<{ status: number; text: string }>;

export interface CoverageDeps {
  provider: SearchProvider;
  /** Status + raw body for a request (any status); throws on network failure. */
  fetchResponse: FetchResponse;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
  maxCalls: number;
}

/** `excludeUrls`: the anchor article itself (forward/contradiction) — the index carries it too,
 *  and a tip is never "covered" by the piece it follows up. Outlet-wide drops are gone (#874). */
export type CoverageChecker = (
  searchKeys: string[],
  excludeUrls?: readonly string[],
) => Promise<TipCoverageCheck>;

export interface CoverageRun {
  check: CoverageChecker;
  provider: SearchProvider;
  /** Provider calls made so far in this run. */
  calls: () => number;
}

/** Brave when its key is set, else GDELT with one warning. Call lazily: the CLI
 *  loads .env inside its require.main block, after every import. */
export function selectProvider(env: NodeJS.ProcessEnv = process.env): SearchProvider {
  const brave = createBraveProvider(env);
  if (brave.isConfigured()) return brave;
  console.warn(
    `[tipwire] ${BRAVE_API_KEY_ENV} unset — coverage falls back to GDELT, which has throttled every request since 2026-09-07`,
  );
  return GDELT_PROVIDER;
}

/** Search keys a web index can answer (see ./coverage-keys), in order, capped. */
export function selectKeys(searchKeys: string[]): string[] {
  return [...new Set(searchKeys.map((k) => k.trim()))]
    .filter((k) => classifyKey(k) !== null)
    .slice(0, COVERAGE_MAX_KEYS_PER_TIP);
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/** host + path, so feed and index spellings of one article (query string, scheme) agree. */
function canonical(url: string): string | null {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '')}`;
  } catch {
    return null;
  }
}

/** Every valid URL counts once except the anchor article, the record's own hosts and
 *  non-coverage hosts (#921); per-host URLs let the digest split own outlet from others. */
export function summarizeHits(
  urls: string[],
  excludeUrls: readonly string[] = [],
): Omit<CoverageKeyResult, 'key'> {
  const excluded = new Set(excludeUrls.map(canonical).filter((c): c is string => c !== null));
  const seen = new Set<string>();
  const hitsByDomain: Record<string, string[]> = {};
  const valid: string[] = [];
  let nationalHit = false;
  for (const u of urls) {
    const h = hostOf(u);
    if (h === null) continue;
    const c = canonical(u);
    if (c !== null && (excluded.has(c) || seen.has(c))) continue;
    if (c !== null) seen.add(c);
    if (isPrimarySource(h) || isNonCoverageHost(h)) continue;
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
  // A quoted report or docket number matches only pages that print it (#925): zero
  // on code keys alone says nothing about coverage.
  if (hits === 0) return ok.some((k) => k.kind !== 'code') ? 'checkable-zero' : 'not-checkable';
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

function defaultFetch(provider: SearchProvider): FetchResponse {
  return async (req) => {
    const res = await fetch(req.url, {
      headers: { 'User-Agent': TIPWIRE_UA, ...req.headers },
      signal: AbortSignal.timeout(provider.timeoutMs),
    });
    return { status: res.status, text: await res.text() };
  };
}

const failedKey = (key: string, error: string): CoverageKeyResult => ({
  key,
  hits: 0,
  sampleUrls: [],
  error,
});

/** One run per poll: it owns the provider, the spacing clock and the call counter. */
export function createCoverageRun(deps: Partial<CoverageDeps> = {}): CoverageRun {
  const provider = deps.provider ?? selectProvider();
  const d: CoverageDeps = {
    provider,
    fetchResponse: deps.fetchResponse ?? defaultFetch(provider),
    sleep: deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))),
    now: deps.now ?? (() => Date.now()),
    maxCalls: deps.maxCalls ?? COVERAGE_MAX_CALLS_PER_RUN,
  };
  let calls = 0;
  let lastCallAt = Number.NEGATIVE_INFINITY;

  async function queryKey(key: string, excludeUrls: readonly string[]): Promise<CoverageKeyResult> {
    if (calls >= d.maxCalls) return failedKey(key, RUN_CAP_ERROR);
    const wait = lastCallAt + provider.minSpacingMs - d.now();
    if (wait > 0) await d.sleep(wait);
    calls++;
    lastCallAt = d.now();
    const kind = classifyKey(key) ?? 'phrase';
    try {
      const query = buildQuery(key, kind);
      const res = await d.fetchResponse(
        provider.buildRequest(query, COVERAGE_WINDOW_DAYS, d.now()),
      );
      const parsed = provider.parse(res.status, res.text);
      if ('error' in parsed) return failedKey(key, parsed.error);
      const relevant =
        kind === 'phrase' ? parsed.results.filter((h) => passesTermGate(key, h)) : parsed.results;
      const urls = relevant.map((h: SearchHit) => h.url);
      return { key, kind, rawHits: parsed.results.length, ...summarizeHits(urls, excludeUrls) };
    } catch (err) {
      return failedKey(key, formatError(err));
    }
  }

  const check: CoverageChecker = async (searchKeys, excludeUrls = []) => {
    const keys: CoverageKeyResult[] = [];
    for (const key of selectKeys(searchKeys)) keys.push(await queryKey(key, excludeUrls));
    return {
      checkedAt: new Date(d.now()).toISOString(),
      windowDays: COVERAGE_WINDOW_DAYS,
      provider: provider.name,
      keys,
      label: labelCoverage(keys),
    };
  };
  return { check, provider, calls: () => calls };
}

/** The checker alone, for call sites that never read the call count. */
export function createCoverageChecker(deps: Partial<CoverageDeps> = {}): CoverageChecker {
  return createCoverageRun(deps).check;
}

/** Reachability canary (#867, #920): one call, results-or-error, no persistence. */
export async function probeCoverage(
  provider: SearchProvider,
  fetchResponse: FetchResponse = defaultFetch(provider),
): Promise<{ ok: boolean; detail: string }> {
  try {
    const query = buildQuery(PROBE_KEY, 'phrase');
    const res = await fetchResponse(provider.buildRequest(query, PROBE_WINDOW_DAYS, Date.now()));
    const parsed = provider.parse(res.status, res.text);
    if ('error' in parsed) {
      const head = res.text.slice(0, 100).replace(/\s+/g, ' ');
      return { ok: false, detail: `${parsed.error}: ${head}` };
    }
    const n = parsed.results.length;
    return { ok: true, detail: `JSON, ${n} result(s) for "${PROBE_KEY}" in ${PROBE_WINDOW_DAYS}d` };
  } catch (err) {
    return { ok: false, detail: formatError(err) };
  }
}

/** Brave ToS §3(b): results are held only while the candidate is open. Counts, label,
 *  national flag and hostnames survive; every URL goes. Pure. */
export function pruneCoverageUrls(check: TipCoverageCheck, prunedAt: string): TipCoverageCheck {
  return {
    ...check,
    urlsPrunedAt: prunedAt,
    keys: check.keys.map((k) => ({
      ...k,
      sampleUrls: [],
      ...(k.hitsByDomain
        ? { hitsByDomain: Object.fromEntries(Object.keys(k.hitsByDomain).map((h) => [h, []])) }
        : {}),
    })),
  };
}
