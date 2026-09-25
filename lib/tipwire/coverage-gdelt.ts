/**
 * GDELT DOC 2.0 as a coverage provider (R-TIPWIRE-3 #861; dormant since
 * R-TIPWIRE-5 #920). Kept for the day its API returns: `selectProvider` falls
 * back to it when no Brave key is set. Its throttle body ("Please limit
 * requests…") arrives with status 200, so the parse maps every non-artlist
 * body to an error — never to zero.
 */

import type { SearchHit, SearchParse, SearchProvider } from './coverage-provider';

const GDELT_DOC_API = 'https://api.gdeltproject.org/api/v2/doc/doc';
const GDELT_MAX_RECORDS = 25;
const GDELT_MIN_SPACING_MS = 6_000;
/** GDELT answers slowly under load — a valid artlist took 25 s from the laptop on
 *  2026-09-08 while the 10 s abort read it as unavailable (#867). */
const GDELT_TIMEOUT_MS = 45_000;

function gdeltUrl(query: string, windowDays: number): string {
  const params = new URLSearchParams({
    query,
    mode: 'artlist',
    maxrecords: String(GDELT_MAX_RECORDS),
    format: 'json',
    timespan: `${windowDays}d`,
  });
  return `${GDELT_DOC_API}?${params.toString()}`;
}

/** GDELT artlist body → hits; null for the throttle text, a 429 page, or
 *  anything without an `articles` array. */
function parseGdeltArtlist(body: string): { results: SearchHit[] } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const articles = (parsed as { articles?: unknown }).articles;
  if (!Array.isArray(articles)) return null;
  const results: SearchHit[] = [];
  for (const a of articles) {
    if (!a || typeof a !== 'object') continue;
    const { url, title } = a as { url?: unknown; title?: unknown };
    if (typeof url !== 'string' || url.length === 0) continue;
    results.push({ url, title: typeof title === 'string' ? title : undefined });
  }
  return { results };
}

export const GDELT_PROVIDER: SearchProvider = {
  name: 'gdelt',
  minSpacingMs: GDELT_MIN_SPACING_MS,
  timeoutMs: GDELT_TIMEOUT_MS,
  costPerCallUsd: 0,
  isConfigured: () => true,
  buildRequest: (query, windowDays) => ({
    url: gdeltUrl(query, windowDays),
    headers: { Accept: 'application/json' },
  }),
  parse(status, body): SearchParse {
    if (status === 429) return { error: 'rate limited (429)' };
    return parseGdeltArtlist(body) ?? { error: 'throttled or invalid response' };
  },
};
