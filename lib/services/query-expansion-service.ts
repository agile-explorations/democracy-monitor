/**
 * Query terminology expansion for hybrid retrieval (#702).
 *
 * A user's phrasing often differs from the vocabulary of the record ("Schedule
 * F" barely appears in the 2025 debate — the record says OPM rules, excepted
 * service, MSPB). An LLM proposes short atomic aliases; corpus validation
 * keeps only aliases that actually occur in the searched window and are
 * specific enough to carry signal. Hallucinated aliases (invented EO numbers,
 * composed titles) die at validation because they match nothing.
 *
 * Failure-safe by construction: no API key, an AI error, or zero surviving
 * aliases all degrade to an empty list — the caller falls back to pure
 * vector retrieval, which is exactly the pre-#702 behavior.
 *
 * Validation counting (and its per-alias cache, #729) lives in
 * alias-count-cache.ts.
 */

import { createHash } from 'crypto';
import { getProvider } from '@/lib/ai/provider';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { getDb, isDbAvailable } from '@/lib/db';
import type { ExpansionWindow } from '@/lib/services/alias-count-cache';
import {
  cachedAliasCount,
  cachedWindowTotal,
  MAX_MATCH_CAP,
  MAX_WINDOW_SHARE,
  MIN_MATCH_CAP,
  windowFilters,
} from '@/lib/services/alias-count-cache';

export type { ExpansionWindow } from '@/lib/services/alias-count-cache';
export {
  cachedCountUsable,
  warmAliasValidation,
  windowFilters,
} from '@/lib/services/alias-count-cache';

const EXPANSION_MODEL = 'gpt-4o-mini';
const EXPANSION_CACHE_TTL = 7 * 86400;
const MAX_ALIASES = 8;

/** Self-referential terms that carry no entity signal in this corpus. */
const BOILERPLATE_ALIASES =
  /^(congressional record|congress|senate|house|united states|federal government|government|executive order)$/i;

export interface ValidatedAlias {
  phrase: string;
  matches: number;
}

const EXPANSION_PROMPT = (query: string) =>
  `For this search query about the U.S. government record, list SHORT ATOMIC search ` +
  `terms (1-3 words each, plus bare order/statute numbers) that would appear LITERALLY ` +
  `in government documents from 2017-2026 — official entity names, order numbers you are ` +
  `CERTAIN of, and era-specific renamings. Never invent numbers or compose descriptive ` +
  `titles; include the core entity itself. Return ONLY a JSON array of 3-8 terms. ` +
  `Query: "${query}"`;

/** LLM alias proposal — cached by normalized query; [] on any failure. */
export async function proposeAliases(query: string): Promise<string[]> {
  const provider = getProvider('openai');
  if (!provider.isAvailable()) return [];
  const key = CacheKeys.queryExpansion(hashExpansionKey(query));
  const cached = await cacheGet<string[]>(key);
  if (cached) return cached;
  try {
    const result = await provider.complete(EXPANSION_PROMPT(query), {
      temperature: 0,
      model: EXPANSION_MODEL,
    });
    const aliases = parseAliasResponse(result.content);
    await cacheSet(key, aliases, EXPANSION_CACHE_TTL);
    return aliases;
  } catch (err) {
    console.warn('[query-expansion] proposal failed (falling back to vector-only):', err);
    return [];
  }
}

/** Parse the model's JSON-array reply; [] when unparseable. Exported for tests. */
export function parseAliasResponse(content: string): string[] {
  try {
    const raw = content.replace(/```json|```/g, '').trim();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((p): p is string => typeof p === 'string' && p.length >= 3 && p.length <= 60)
      .slice(0, MAX_ALIASES);
  } catch {
    console.warn(
      '[query-expansion] unparseable alias reply (vector-only fallback):',
      content.slice(0, 120),
    );
    return [];
  }
}

/** True when an alias is corpus boilerplate with no entity signal. Exported for tests. */
export function isBoilerplateAlias(phrase: string): boolean {
  return BOILERPLATE_ALIASES.test(phrase.trim());
}

/**
 * Statutory-citation spelling variants (#712): users and models write "287g"
 * while the record writes "287(g)" — and FTS tokenizes them disjointly
 * ('287g' vs '287' + 'g'), so the wrong spelling makes the keyword arm blind
 * to 208 floor speeches (measured 2026-08-12). Generate the alternate
 * spelling for both directions; corpus validation keeps only forms that
 * actually match. Exported for tests.
 */
export function citationVariants(phrase: string): string[] {
  const variants = new Set<string>();
  const parenthesized = phrase.replace(/\b(\d+)([a-z])\b/gi, '$1($2)');
  if (parenthesized !== phrase) variants.add(parenthesized);
  const collapsed = phrase.replace(/\b(\d+)\(([a-z])\)/gi, '$1$2');
  if (collapsed !== phrase) variants.add(collapsed);
  // Bare citations (#716): "287(g) agreements" as an adjacent phrase matches
  // 71 docs; the record usually writes bare "287(g)" followed by other words
  // ("program", "of the INA") — 305 docs, 134 of them floor speeches
  // (measured 2026-08-13). Emit each citation token alone, in both
  // spellings; validation and the match cap decide admission.
  for (const source of [phrase, parenthesized]) {
    for (const m of source.matchAll(/\b\d+\([a-z]\)|\b\d+[a-z]\b/gi)) {
      const bare = m[0];
      if (bare.length >= 3 && bare.toLowerCase() !== phrase.toLowerCase()) {
        variants.add(bare);
        for (const v of citationSpellings(bare)) variants.add(v);
      }
    }
  }
  variants.delete(phrase);
  return [...variants];
}

/** Both spellings of a single citation token (helper for bare extraction). */
function citationSpellings(token: string): string[] {
  const out = new Set<string>();
  const p = token.replace(/\b(\d+)([a-z])\b/gi, '$1($2)');
  if (p !== token) out.add(p);
  const c = token.replace(/\b(\d+)\(([a-z])\)/gi, '$1$2');
  if (c !== token) out.add(c);
  return [...out];
}

/**
 * Corpus validation: keep aliases that match at least one document and at
 * most 5% of the searched window, clamped to [MIN_MATCH_CAP, MAX_MATCH_CAP].
 * All counts are LIMIT-bounded — validation cost stays flat no matter how
 * broad the window or how common an alias.
 */
export async function validateAliases(
  phrases: string[],
  window: ExpansionWindow,
): Promise<ValidatedAlias[]> {
  return (await validateAliasesDiagnostic(phrases, window)).validated;
}

export interface ExpansionDiagnostic {
  proposed: string[];
  validated: ValidatedAlias[];
  rejected: Array<{ phrase: string; reason: string; matches?: number }>;
  matchCap: number;
}

/** validateAliases with the discard reasons retained (#718 debug trace).
 *  The production path is this function — validateAliases just drops the
 *  diagnostics — so the trace can never diverge from real behavior. */
export async function validateAliasesDiagnostic(
  phrases: string[],
  window: ExpansionWindow,
): Promise<ExpansionDiagnostic> {
  const empty: ExpansionDiagnostic = {
    proposed: phrases,
    validated: [],
    rejected: [],
    matchCap: 0,
  };
  if (!isDbAvailable() || phrases.length === 0) return empty;
  const db = getDb();
  const filters = windowFilters(window);
  const windowTotal = await cachedWindowTotal(db, window, filters);
  const maxMatches = Math.max(
    MIN_MATCH_CAP,
    Math.min(MAX_MATCH_CAP, Math.floor(windowTotal * MAX_WINDOW_SHARE)),
  );
  const rejected: ExpansionDiagnostic['rejected'] = phrases
    .filter((p) => isBoilerplateAlias(p))
    .map((phrase) => ({ phrase, reason: 'boilerplate' }));
  const base = phrases.filter((p) => !isBoilerplateAlias(p));
  // Statutory-citation variants ride along; validation decides which spelling
  // the corpus actually uses. Dedupe case-insensitively, originals first.
  const seen = new Set(base.map((p) => p.toLowerCase()));
  const candidates = [...base];
  for (const p of base) {
    for (const v of citationVariants(p)) {
      if (!seen.has(v.toLowerCase())) {
        seen.add(v.toLowerCase());
        candidates.push(v);
      }
    }
  }
  // Counts run concurrently — bounded index scans; order is preserved. Each
  // alias is counted only to maxMatches+1: enough to decide the cap, and
  // armWeight saturates well below that anyway. Counts are cached per
  // (alias, window, data week) — see cachedAliasCount (#729 follow-up).
  const counts = await Promise.all(
    candidates.map(async (phrase) => ({
      phrase,
      matches: await cachedAliasCount(db, phrase, window, filters, maxMatches),
    })),
  );
  const validated: ValidatedAlias[] = [];
  for (const c of counts) {
    if (c.matches < 1) rejected.push({ phrase: c.phrase, reason: 'zero-matches', matches: 0 });
    else if (c.matches > maxMatches)
      rejected.push({ phrase: c.phrase, reason: 'over-match-cap', matches: c.matches });
    else validated.push(c);
  }
  return { proposed: phrases, validated, rejected, matchCap: maxMatches };
}

/**
 * Full expansion pipeline: propose → validate. Cached end-to-end per
 * (query, window) so the API route can re-call it for the "also searched"
 * transparency chips at zero cost.
 */
export async function expandAndValidate(
  query: string,
  window: ExpansionWindow,
): Promise<ValidatedAlias[]> {
  // Ops kill switch: setting HYBRID_RETRIEVAL_DISABLED=1 reverts every search
  // surface to pure-vector retrieval without a deploy. Also used by the
  // holdout harness to measure baseline vs hybrid on identical code.
  if (process.env.HYBRID_RETRIEVAL_DISABLED === '1') return [];
  const key = CacheKeys.queryExpansionValidated(hashExpansionKey(query, window));
  const cached = await cacheGet<ValidatedAlias[]>(key);
  if (cached) return cached;
  const validated = await validateAliases(await proposeAliases(query), window);
  await cacheSet(key, validated, EXPANSION_CACHE_TTL);
  return validated;
}

/** Full expansion with diagnostics for the debug trace (#718) — uncached
 *  except the LLM proposal, so rejected reasons are always current. */
export async function expandDiagnostic(
  query: string,
  window: ExpansionWindow,
): Promise<ExpansionDiagnostic> {
  if (process.env.HYBRID_RETRIEVAL_DISABLED === '1') {
    return { proposed: [], validated: [], rejected: [], matchCap: 0 };
  }
  return validateAliasesDiagnostic(await proposeAliases(query), window);
}

function hashExpansionKey(query: string, window?: ExpansionWindow): string {
  const material = [
    'v3', // bumped for bare-citation extraction (#716) — invalidates pre-fix caches
    query.toLowerCase().trim(),
    window?.dateFrom ?? '',
    window?.dateTo ?? '',
    window?.tier ?? '',
    window?.category ?? '',
  ].join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}
