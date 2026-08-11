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

function windowFilters(w: ExpansionWindow) {
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

/**
 * Corpus validation: keep aliases that match at least one document and at
 * most 5% of the searched window (floor 200 for small windows). One GIN
 * count query per alias — milliseconds each.
 */
export async function validateAliases(
  phrases: string[],
  window: ExpansionWindow,
): Promise<ValidatedAlias[]> {
  if (!isDbAvailable() || phrases.length === 0) return [];
  const db = getDb();
  const filters = windowFilters(window);
  const windowTotal = Number(
    (
      (await db.execute(sql`SELECT count(*) AS n FROM documents d WHERE ${filters}`)).rows[0] as {
        n: string;
      }
    ).n,
  );
  const maxMatches = Math.max(MIN_MATCH_CAP, Math.floor(windowTotal * MAX_WINDOW_SHARE));
  const candidates = phrases.filter((p) => !isBoilerplateAlias(p));
  // Counts run concurrently — independent GIN lookups; order is preserved.
  const counts = await Promise.all(
    candidates.map(async (phrase) => {
      const quoted = `"${phrase.replace(/"/g, '')}"`;
      const r = await db.execute(sql`
      SELECT count(*) AS n FROM documents d
      WHERE ${filters}
        AND d.search_vector @@ websearch_to_tsquery('english', ${quoted})`);
      return { phrase, matches: Number((r.rows[0] as { n: string }).n) };
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
    query.toLowerCase().trim(),
    window?.dateFrom ?? '',
    window?.dateTo ?? '',
    window?.tier ?? '',
    window?.category ?? '',
  ].join('|');
  return createHash('sha256').update(material).digest('hex').slice(0, 16);
}
