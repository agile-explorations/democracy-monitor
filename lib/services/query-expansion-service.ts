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
 */

import { createHash } from 'crypto';
import { sql } from 'drizzle-orm';
import { getProvider } from '@/lib/ai/provider';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import type { DocumentTier } from '@/lib/data/document-tiers';
import { DISCUSSION_SOURCE_TYPES } from '@/lib/data/document-tiers';
import { getDb, isDbAvailable } from '@/lib/db';
import { SEARCH_EXCLUDED_ORIGINS } from '@/lib/services/search-queries';

const EXPANSION_MODEL = 'gpt-4o-mini';
const EXPANSION_CACHE_TTL = 7 * 86400;
const MAX_ALIASES = 8;
/** An alias may match at most this share of the searched window. */
const MAX_WINDOW_SHARE = 0.05;
/** Small windows: absolute floor for the match cap. */
const MIN_MATCH_CAP = 200;
/** Absolute ceiling for alias admission, aligned with the fusion math: an
 *  arm's weight (1/(1+log10(1+n/100))) falls below the ~0.67 RRF surfacing
 *  threshold near n≈1000 — broader aliases cannot surface results but cost
 *  the most to rank (each match detoasts a ~20KB rank vector; one broad arm
 *  measured 31s on cold prod cache, 2026-08-11). */
const MAX_MATCH_CAP = 1000;
/** Self-referential terms that carry no entity signal in this corpus. */
const BOILERPLATE_ALIASES =
  /^(congressional record|congress|senate|house|united states|federal government|government|executive order)$/i;

export interface ValidatedAlias {
  phrase: string;
  matches: number;
}

export interface ExpansionWindow {
  dateFrom?: string;
  dateTo?: string;
  tier?: DocumentTier;
  category?: string;
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

/** Window filter clause for validation counts. Exported for tests. */
export function windowFilters(w: ExpansionWindow) {
  const conditions = [
    sql`d.embedding IS NOT NULL`,
    sql`d.retrieval_relevant IS NOT FALSE`,
    sql`d.content_type != 'metadata_only'`,
    sql`d.category != 'intent'`,
    sql`d.source_origin IS NOT NULL`,
    sql`d.source_origin NOT IN (${sql.join(
      SEARCH_EXCLUDED_ORIGINS.map((o) => sql`${o}`),
      sql`, `,
    )})`,
  ];
  if (w.dateFrom) conditions.push(sql`d.published_at >= ${w.dateFrom}::timestamptz`);
  if (w.dateTo) conditions.push(sql`d.published_at <= ${w.dateTo}::timestamptz`);
  if (w.category) conditions.push(sql`d.category = ${w.category}`);
  if (w.tier) {
    const types = sql.join(
      [...DISCUSSION_SOURCE_TYPES].map((t) => sql`${t}`),
      sql`, `,
    );
    conditions.push(
      w.tier === 'action' ? sql`d.source_type NOT IN (${types})` : sql`d.source_type IN (${types})`,
    );
  }
  return sql.join(conditions, sql` AND `);
}

/** Window-size counting saturates here: caps validation work on broad
 *  windows (an unbounded count over a no-filter window scanned ~400k rows —
 *  the whole 60s edge-timeout budget on a cold prod cache, 2026-08-11). */
const WINDOW_COUNT_CAP = 100000;

/** Bounded count: scans at most `cap` matching rows instead of the full set. */
async function cappedCount(
  db: ReturnType<typeof getDb>,
  where: ReturnType<typeof sql>,
  cap: number,
): Promise<number> {
  const r = await db.execute(sql`
    SELECT count(*) AS n FROM (
      SELECT 1 FROM documents d WHERE ${where} LIMIT ${cap}
    ) capped`);
  return Number((r.rows[0] as { n: string }).n);
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
  if (!isDbAvailable() || phrases.length === 0) return [];
  const db = getDb();
  const filters = windowFilters(window);
  const windowTotal = await cappedCount(db, filters, WINDOW_COUNT_CAP);
  const maxMatches = Math.max(
    MIN_MATCH_CAP,
    Math.min(MAX_MATCH_CAP, Math.floor(windowTotal * MAX_WINDOW_SHARE)),
  );
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
  // armWeight saturates well below that anyway.
  const counts = await Promise.all(
    candidates.map(async (phrase) => {
      const quoted = `"${phrase.replace(/"/g, '')}"`;
      const matchFilter = sql`${filters}
        AND d.search_vector @@ websearch_to_tsquery('english', ${quoted})`;
      return { phrase, matches: await cappedCount(db, matchFilter, maxMatches + 1) };
    }),
  );
  return counts.filter((c) => c.matches >= 1 && c.matches <= maxMatches);
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
