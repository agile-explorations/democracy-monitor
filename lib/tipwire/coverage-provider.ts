/**
 * R-TIPWIRE-5 (#920): the search provider behind the coverage check. One
 * interface, two implementations — Brave Search (./coverage-brave, keyed,
 * the default) and GDELT DOC 2.0 (./coverage-gdelt, dormant: its API has
 * throttled every request since 2026-09-07). The checker in ./coverage owns
 * the clock, the run cap and the grading; ./coverage-keys shapes the query;
 * a provider only builds one request and reads one response.
 */

export type CoverageProviderName = 'brave' | 'gdelt';

export interface SearchRequest {
  url: string;
  /** Provider headers (the API key travels here, never in the URL, so URLs may be logged). */
  headers: Record<string, string>;
}

/** One result. Title and description are read only to judge relevance (#925) and
 *  never persisted — the stored check carries URLs, hostnames and counts. */
export interface SearchHit {
  url: string;
  title?: string;
  description?: string;
}

export type SearchParse = { results: SearchHit[] } | { error: string };

export interface SearchProvider {
  name: CoverageProviderName;
  /** Calls within one run are serialized at least this far apart. */
  minSpacingMs: number;
  timeoutMs: number;
  /** Metered price per request, for the poll's cost line (0 when unmetered). */
  costPerCallUsd: number;
  isConfigured(): boolean;
  /** `query` arrives shaped (quoted or not) by ./coverage-keys; pass it verbatim. */
  buildRequest(query: string, windowDays: number, nowMs?: number): SearchRequest;
  /** Status first, then the body: a metered API tells quota and auth apart from "no results". */
  parse(status: number, body: string): SearchParse;
}
