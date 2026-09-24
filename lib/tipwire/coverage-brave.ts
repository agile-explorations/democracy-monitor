/**
 * Brave Search API as the coverage provider (R-TIPWIRE-5 #920). Web endpoint,
 * one request per key (shaped by ./coverage-keys): US/English, 30-day
 * freshness, web + news clusters in one answer. URL, title and description
 * are read; only URLs, hostnames and counts are ever stored.
 *
 * Terms that shape the code: results may be held only transiently (hit URLs
 * are pruned once a candidate closes — ./coverage `pruneCoverageUrls`), and
 * "Powered by Brave" is rendered wherever they display (./coverage-line).
 * Metered at $5 per 1,000 requests after the $5 monthly credit; the entry
 * plan allows one request per second.
 */

import { toDateString } from '@/lib/utils/date-utils';
import type { SearchHit, SearchParse, SearchProvider, SearchRequest } from './coverage-provider';

export const BRAVE_API_KEY_ENV = 'BRAVE_SEARCH_API_KEY';
const BRAVE_WEB_SEARCH = 'https://api.search.brave.com/res/v1/web/search';
const BRAVE_COUNT = 20;
const BRAVE_MIN_SPACING_MS = 1_100;
const BRAVE_TIMEOUT_MS = 15_000;
const BRAVE_COST_PER_CALL_USD = 0.005;
const FRESHNESS_TOKENS: Record<number, string> = {
  1: 'pd',
  7: 'pw',
  30: 'pm',
  31: 'pm',
  365: 'py',
};
const DAY_MS = 86_400_000;

/** Brave's freshness token for the window, or an explicit date range when none fits. */
export function braveFreshness(windowDays: number, nowMs: number): string {
  const token = FRESHNESS_TOKENS[windowDays];
  if (token) return token;
  const from = toDateString(new Date(nowMs - windowDays * DAY_MS));
  return `${from}to${toDateString(new Date(nowMs))}`;
}

function braveUrl(query: string, windowDays: number, nowMs: number): string {
  const params = new URLSearchParams({
    q: query,
    count: String(BRAVE_COUNT),
    country: 'us',
    search_lang: 'en',
    freshness: braveFreshness(windowDays, nowMs),
    result_filter: 'web,news',
    // An identifier like 2026-18061 must not be "corrected".
    spellcheck: 'false',
  });
  return `${BRAVE_WEB_SEARCH}?${params.toString()}`;
}

interface BraveSection {
  results?: unknown;
}

interface BraveBody {
  web?: BraveSection;
  news?: BraveSection;
  error?: { detail?: unknown };
}

const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

function resultHits(section: BraveSection | undefined): SearchHit[] {
  const results = section?.results;
  if (!Array.isArray(results)) return [];
  const hits: SearchHit[] = [];
  for (const r of results) {
    if (!r || typeof r !== 'object') continue;
    const { url, title, description } = r as Record<string, unknown>;
    if (typeof url !== 'string' || url.length === 0) continue;
    hits.push({ url, title: str(title), description: str(description) });
  }
  return hits;
}

function parseBody(body: string): BraveBody | null {
  try {
    const parsed: unknown = JSON.parse(body);
    return parsed && typeof parsed === 'object' ? (parsed as BraveBody) : null;
  } catch {
    return null;
  }
}

/** A zero-result 2xx omits the `web` key entirely, so any 2xx JSON object is a
 *  valid (possibly empty) answer; only the status codes below are failures. */
function parseBraveResponse(status: number, body: string): SearchParse {
  if (status === 429) return { error: 'rate limited' };
  if (status === 401) return { error: 'auth rejected (401)' };
  if (status === 402) return { error: 'quota exhausted (402)' };
  const parsed = parseBody(body);
  if (status === 422) {
    const detail = parsed?.error?.detail;
    return { error: typeof detail === 'string' ? `invalid request: ${detail}` : 'HTTP 422' };
  }
  if (status < 200 || status >= 300) return { error: `HTTP ${status}` };
  if (!parsed) return { error: 'invalid response' };
  // News first, so the capped samples prefer news items.
  return { results: [...resultHits(parsed.news), ...resultHits(parsed.web)] };
}

export function createBraveProvider(env: NodeJS.ProcessEnv = process.env): SearchProvider {
  const apiKey = () => env[BRAVE_API_KEY_ENV]?.trim() ?? '';
  return {
    name: 'brave',
    minSpacingMs: BRAVE_MIN_SPACING_MS,
    timeoutMs: BRAVE_TIMEOUT_MS,
    costPerCallUsd: BRAVE_COST_PER_CALL_USD,
    isConfigured: () => apiKey().length > 0,
    buildRequest: (query, windowDays, nowMs = Date.now()): SearchRequest => ({
      url: braveUrl(query, windowDays, nowMs),
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey() },
    }),
    parse: parseBraveResponse,
  };
}
