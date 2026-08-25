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
  cachedWindowTotal,
  countAliasCandidates,
  MAX_MATCH_CAP,
  MAX_WINDOW_SHARE,
  MIN_MATCH_CAP,
  windowFilters,
} from '@/lib/services/alias-count-cache';
import { classifyQuestionMode } from '@/lib/services/question-classifier';

export type { ExpansionWindow } from '@/lib/services/alias-count-cache';
export {
  cachedCountUsable,
  warmAliasValidation,
  windowFilters,
} from '@/lib/services/alias-count-cache';

const EXPANSION_MODEL = 'gpt-4o-mini';
const EXPANSION_CACHE_TTL = 7 * 86400;
const MAX_ALIASES = 12;
// #763 R5 (16-term enumeration expansion) was measured and dropped: the
// matrix attributed the gains to slot guarantees, not width, and the extra
// aliases were a main driver of the 100-150s cold seed (owner option-1
// decision, 2026-08-22). parseAliasResponse keeps its limit param.
/** Cap on narrower re-proposals accepted from the single retry round (#733). */
const MAX_NARROWED_ALIASES = 4;

/** Self-referential terms that carry no entity signal in this corpus. */
const BOILERPLATE_ALIASES =
  /^(congressional record|congress|senate|house|united states|federal government|government|executive order)$/i;

export interface ValidatedAlias {
  phrase: string;
  matches: number;
}

const EXPANSION_PROMPT = (query: string, cap: number = MAX_ALIASES) =>
  `For this search query about the U.S. government record, list SHORT ATOMIC search ` +
  `terms (1-4 words each, plus bare order/statute numbers) that would appear LITERALLY ` +
  `in government documents from 2017-2026. Draw from every class that fits the query: ` +
  `official entity and program names, order/statute numbers you are CERTAIN of, ` +
  `era-specific renamings, case captions of litigation you are CERTAIN of (styled ` +
  `"X v. Y"), full names of officials or named individuals central to the topic, ` +
  `named operations or initiatives, and the record's own terms of art for the topic. ` +
  `Never invent numbers, captions, or names; never compose descriptive titles; ` +
  `include the core entity itself. Return ONLY a JSON array of 5-${cap} terms. ` +
  `Query: "${query}"`;

/** Follow-up proposal for over-cap rejects (#733): the entity is real and
 *  present in the corpus — the phrase is just too broad to be a useful arm. */
const NARROWING_PROMPT = (query: string, phrases: string[]) =>
  `These search terms each matched too many U.S. government documents to be ` +
  `useful filters for the query below: ${phrases.map((p) => `"${p}"`).join(', ')}. ` +
  `For each, propose at most one NARROWER variant (2-4 words) that would still ` +
  `appear LITERALLY in the documents most relevant to the query — a more specific ` +
  `program, subunit, document series, or action phrase. Never invent numbers, ` +
  `captions, or names. Return ONLY a JSON array of 0-${MAX_NARROWED_ALIASES} terms. ` +
  `Query: "${query}"`;

/** LLM alias proposal — cached by normalized query; [] on any failure. */
/** #773: temp-0 completions are still nondeterministic across calls —
 *  each call is a draw, and a cached bad draw (EO 11625 in a 2026 answer)
 *  costs its question for the full cache TTL. Two draws unioned compress
 *  the variance upward for ~one extra mini call per question-week. */
const EXPANSION_DRAWS = 2;

export async function proposeAliases(query: string): Promise<string[]> {
  const provider = getProvider('openai');
  if (!provider.isAvailable()) return [];
  const key = CacheKeys.queryExpansion(hashExpansionKey(query));
  const cached = await cacheGet<string[]>(key);
  if (cached) return cached;
  try {
    const results = await Promise.all(
      Array.from({ length: EXPANSION_DRAWS }, () =>
        provider.complete(EXPANSION_PROMPT(query), {
          temperature: 0,
          model: EXPANSION_MODEL,
        }),
      ),
    );
    const aliases = unionDraws(results.map((r) => parseAliasResponse(r.content)));
    await cacheSet(key, aliases, EXPANSION_CACHE_TTL);
    return aliases;
  } catch (err) {
    console.warn('[query-expansion] proposal failed (falling back to vector-only):', err);
    return [];
  }
}

/** Union draws preserving order: draw-1 terms first, then novel draw-2
 *  terms, case-insensitively deduped, capped at twice the single-draw
 *  limit (validation caps still apply downstream). Pure; exported for
 *  tests. */
export function unionDraws(draws: string[][], cap: number = MAX_ALIASES * 2): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const draw of draws) {
    for (const phrase of draw) {
      const k = phrase.toLowerCase().trim();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(phrase);
      if (out.length >= cap) return out;
    }
  }
  return out;
}

/** Parse the model's JSON-array reply; [] when unparseable. Exported for tests. */
export function parseAliasResponse(content: string, limit: number = MAX_ALIASES): string[] {
  try {
    const raw = content.replace(/```json|```/g, '').trim();
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((p): p is string => typeof p === 'string' && p.length >= 3 && p.length <= 60)
      .slice(0, limit);
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

export interface ExpansionDiagnostic {
  proposed: string[];
  validated: ValidatedAlias[];
  rejected: Array<{ phrase: string; reason: string; matches?: number }>;
  matchCap: number;
}

/** Statutory-citation variants ride along; validation decides which spelling
 *  the corpus actually uses. Dedupe case-insensitively, originals first. */
function withCitationVariants(base: string[]): string[] {
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
  return candidates;
}

/**
 * Corpus validation with discard reasons retained (#718 debug trace): keep
 * aliases that match at least one document and at most 5% of the searched
 * window, clamped to [MIN_MATCH_CAP, MAX_MATCH_CAP]. All counts are
 * LIMIT-bounded — validation cost stays flat no matter how broad the window
 * or how common an alias. The production path is this same function, so the
 * trace can never diverge from real behavior.
 */
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
  // Window-total failure (cold-I/O timeout) degrades to vector-only rather
  // than killing the build (#729 hotfix).
  let windowTotal: number;
  try {
    windowTotal = await cachedWindowTotal(db, window, filters);
  } catch (err) {
    console.warn('[query-expansion] window-total count failed (vector-only fallback):', err);
    return empty;
  }
  const maxMatches = Math.max(
    MIN_MATCH_CAP,
    Math.min(MAX_MATCH_CAP, Math.floor(windowTotal * MAX_WINDOW_SHARE)),
  );
  const rejected: ExpansionDiagnostic['rejected'] = phrases
    .filter((p) => isBoilerplateAlias(p))
    .map((phrase) => ({ phrase, reason: 'boilerplate' }));
  const candidates = withCitationVariants(phrases.filter((p) => !isBoilerplateAlias(p)));
  const counts = await countAliasCandidates(db, candidates, window, filters, maxMatches);
  const validated: ValidatedAlias[] = [];
  for (const c of counts) {
    if (c.matches === -1) rejected.push({ phrase: c.phrase, reason: 'count-failed' });
    else if (c.matches < 1) rejected.push({ phrase: c.phrase, reason: 'zero-matches', matches: 0 });
    else if (c.matches > maxMatches)
      rejected.push({ phrase: c.phrase, reason: 'over-match-cap', matches: c.matches });
    else validated.push(c);
  }
  return { proposed: phrases, validated, rejected, matchCap: maxMatches };
}

/** LLM narrowing proposal for over-cap rejects; [] on any failure. */
async function proposeNarrower(query: string, phrases: string[]): Promise<string[]> {
  if (phrases.length === 0) return [];
  const provider = getProvider('openai');
  if (!provider.isAvailable()) return [];
  try {
    const result = await provider.complete(NARROWING_PROMPT(query, phrases), {
      temperature: 0,
      model: EXPANSION_MODEL,
    });
    return parseAliasResponse(result.content).slice(0, MAX_NARROWED_ALIASES);
  } catch (err) {
    console.warn('[query-expansion] narrowing proposal failed (round-1 result kept):', err);
    return [];
  }
}

/**
 * Propose → validate, with ONE narrowing retry for over-match-cap rejects
 * (#733). Over-cap rejects carry real signal — the entity exists in the
 * corpus and the phrase is merely too broad to be an admissible arm — so a
 * single follow-up proposal converts them into narrower candidates.
 * Zero-match rejects are never retried: that is the hallucination guard.
 * Shared by the production path AND the debug trace so the trace can never
 * diverge from real behavior. Exported for tests.
 */
export async function expandDiagnosticWithRetry(
  query: string,
  window: ExpansionWindow,
): Promise<ExpansionDiagnostic> {
  const first = await validateAliasesDiagnostic(await proposeAliases(query), window);
  const overCap = first.rejected.filter((r) => r.reason === 'over-match-cap');
  if (overCap.length === 0) return first;
  const seen = new Set(
    [
      ...first.proposed,
      ...first.validated.map((v) => v.phrase),
      ...first.rejected.map((r) => r.phrase),
    ].map((p) => p.toLowerCase()),
  );
  const narrowed = (
    await proposeNarrower(
      query,
      overCap.map((r) => r.phrase),
    )
  ).filter((p) => !seen.has(p.toLowerCase()));
  if (narrowed.length === 0) return first;
  const second = await validateAliasesDiagnostic(narrowed, window);
  const validatedSeen = new Set(first.validated.map((v) => v.phrase.toLowerCase()));
  return {
    proposed: [...first.proposed, ...narrowed],
    validated: [
      ...first.validated,
      ...second.validated.filter((v) => !validatedSeen.has(v.phrase.toLowerCase())),
    ],
    rejected: [...first.rejected, ...second.rejected],
    matchCap: first.matchCap,
  };
}

/**
 * Full expansion pipeline: propose → validate → narrowing retry. Cached
 * end-to-end per (query, window) so the API route can re-call it for the
 * "also searched" transparency chips at zero cost.
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
  // Belt to the per-count tolerance (#729 hotfix): ANY validation failure
  // degrades to pure-vector retrieval — the module's failure-safe contract.
  // The failure result is NOT cached, so the next request retries.
  let validated: ValidatedAlias[];
  try {
    validated = (await expandDiagnosticWithRetry(query, window)).validated;
  } catch (err) {
    console.warn('[query-expansion] validation failed (vector-only fallback):', err);
    return [];
  }
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
  return expandDiagnosticWithRetry(query, window);
}

function hashExpansionKey(query: string, window?: ExpansionWindow): string {
  const material = [
    'v5', // #773 union-of-two-draws — invalidates pinned single-draw caches
    query.toLowerCase().trim(),
    window?.dateFrom ?? '',
    window?.dateTo ?? '',
    window?.tier ?? '',
    window?.category ?? '',
  ].join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}
