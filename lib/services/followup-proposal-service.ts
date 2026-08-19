/**
 * Read-step follow-up proposals (#756, R-DECOMP pivot).
 *
 * The seed pool's own text names the entities the question needs — probe
 * work showed "Alien Enemies", "Abrego", and "Comey" sitting inside CREC
 * letters and floor statements while the case documents themselves stayed
 * unretrieved. A first version digested the first 500 chars of each doc and
 * went blind: those mentions sit DEEP inside long floor debates. This
 * version deep-fetches LEFT(content, 12k) for the fused seed pool and reads
 * it in document chunks — one gpt-4o-mini call per chunk, in parallel —
 * asking for literal search phrases for specific entities MENTIONED in the
 * pool that bear on the question. Corpus-grounded, so the model's knowledge
 * cutoff is irrelevant — it only reports what the documents say. Proposals
 * then pass the standard alias validation (match caps, boilerplate
 * stoplist) before becoming arms.
 *
 * Failure-tolerant: any error degrades to zero proposals (a failed chunk
 * drops only its own proposals).
 */

import { createHash } from 'crypto';
import { sql } from 'drizzle-orm';
import { getProvider } from '@/lib/ai/provider';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { getDb, isDbAvailable } from '@/lib/db';
import { dataWeekStamp } from '@/lib/services/arm-cache';
import { parseAliasResponse } from '@/lib/services/query-expansion-service';
import type { ResearchDocument } from '@/lib/types/search';

const FOLLOWUP_MODEL = 'gpt-4o-mini';
const FOLLOWUP_CACHE_TTL = 7 * 86400;
/** Chars of each seed doc's content shown to the read step — deep enough
 *  to reach mid-debate mentions in long CREC granules. */
const DIGEST_CONTENT_CHARS = 12000;
/** Docs per read call: 15 × 12k chars ≈ 48k tokens, comfortable for the
 *  model; chunks run in parallel. */
const DIGEST_CHUNK_DOCS = 15;
const MAX_DIGEST_DOCS = 60;
/** Total proposals forwarded to validation across all chunks. */
const MAX_FOLLOWUP_PROPOSALS = 24;

export interface DigestEntry {
  title: string;
  sourceType: string;
  publishedAt: string | null;
  body: string;
}

/** Compact entry-per-doc digest of one chunk. Exported for tests. */
export function buildPoolDigest(entries: DigestEntry[]): string {
  return entries
    .map((d, i) => {
      const date = d.publishedAt?.slice(0, 10) ?? 'undated';
      const excerpt = d.body.replace(/\s+/g, ' ').slice(0, DIGEST_CONTENT_CHARS);
      return `${i + 1}. [${d.sourceType}, ${date}] ${d.title}\n   ${excerpt}`;
    })
    .join('\n');
}

const FOLLOWUP_PROMPT = (query: string, digest: string) =>
  `A research system retrieved government documents for this question:\n` +
  `"${query}"\n\n` +
  `Below is one batch of those documents. Scan the text for SPECIFIC named ` +
  `entities that bear on the question — case captions ("X v. Y"), named ` +
  `statutes, executive order or proclamation numbers, full names of ` +
  `individuals subject to government action, named operations or programs. ` +
  `Prioritize entities that are MENTIONED in passing but whose own primary ` +
  `documents do not appear in the batch — those are the retrieval gaps worth ` +
  `a follow-up search. NEVER propose bare statute or regulation section ` +
  `citations (like "8 U.S.C. § 1226" or C.F.R. sections) — every document ` +
  `in a domain cites those, so they discriminate nothing. Only report ` +
  `entities that literally appear in the text below; never add knowledge of ` +
  `your own. Return ONLY a JSON array of 0-12 short search phrases (1-5 words).\n\n${digest}`;

/** Section citations discriminate nothing — every doc in the domain cites
 *  them, so as arms they re-boost incumbents and drown the entity arms
 *  (measured in the IM3 fusion trace, #756). Belt to the prompt's ban. */
const SECTION_CITATION = /U\.S\.C\.|C\.F\.R\.|^\s*§|^\d+\s*[a-z]?\s*\(|^\d{3,4}[a-z]?(\(|$)/i;

function hashFollowupKey(query: string): string {
  return createHash('sha256')
    .update(['v4', dataWeekStamp(), query.toLowerCase().trim()].join('|'))
    .digest('hex')
    .slice(0, 16);
}

/** Deep content for the digest — the ResearchDocument read-time cap (5k)
 *  is too shallow to reach mid-debate mentions. */
async function fetchDeepBodies(ids: number[]): Promise<Map<number, string>> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT d.id, LEFT(d.content, ${DIGEST_CONTENT_CHARS}) as body
    FROM documents d
    WHERE d.id IN (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )})`);
  return new Map(
    (rows.rows as Array<{ id: number; body: string | null }>).map((r) => [r.id, r.body ?? '']),
  );
}

async function proposeFromChunk(query: string, entries: DigestEntry[]): Promise<string[]> {
  try {
    const provider = getProvider('openai');
    const result = await provider.complete(FOLLOWUP_PROMPT(query, buildPoolDigest(entries)), {
      temperature: 0,
      model: FOLLOWUP_MODEL,
    });
    return parseAliasResponse(result.content);
  } catch (err) {
    console.warn('[followup-proposal] chunk failed (dropping its proposals):', err);
    return [];
  }
}

/**
 * Propose follow-up search phrases from the seed pool. Cached per
 * (question, data week); [] on any failure.
 */
export async function proposeFollowups(
  query: string,
  seedDocs: ResearchDocument[],
): Promise<string[]> {
  const provider = getProvider('openai');
  if (!provider.isAvailable() || !isDbAvailable() || seedDocs.length === 0) return [];
  const key = CacheKeys.searchFollowup(hashFollowupKey(query));
  const cached = await cacheGet<string[]>(key);
  if (cached) return cached;
  try {
    const docs = seedDocs.slice(0, MAX_DIGEST_DOCS);
    const bodies = await fetchDeepBodies(docs.map((d) => d.id));
    const entries: DigestEntry[] = docs.map((d) => ({
      title: d.title,
      sourceType: d.sourceType,
      publishedAt: d.publishedAt,
      body: bodies.get(d.id) ?? d.content ?? '',
    }));
    const chunks: DigestEntry[][] = [];
    for (let i = 0; i < entries.length; i += DIGEST_CHUNK_DOCS) {
      chunks.push(entries.slice(i, i + DIGEST_CHUNK_DOCS));
    }
    const perChunk = await Promise.all(chunks.map((c) => proposeFromChunk(query, c)));
    // Round-robin across chunks before capping: a concat-then-slice would
    // let chunk 1's prominent citations starve the later chunks — which is
    // where deep-pool mention docs land (same cap-ordering failure the
    // mining path hit; see entity-mining.ts).
    const seen = new Set<string>();
    const phrases: string[] = [];
    for (let round = 0; phrases.length < MAX_FOLLOWUP_PROPOSALS; round++) {
      let advanced = false;
      for (const chunk of perChunk) {
        if (round >= chunk.length) continue;
        advanced = true;
        const phrase = chunk[round];
        const k = phrase.toLowerCase();
        if (seen.has(k) || SECTION_CITATION.test(phrase)) continue;
        seen.add(k);
        phrases.push(phrase);
        if (phrases.length >= MAX_FOLLOWUP_PROPOSALS) break;
      }
      if (!advanced) break;
    }
    await cacheSet(key, phrases, FOLLOWUP_CACHE_TTL);
    return phrases;
  } catch (err) {
    console.warn('[followup-proposal] failed (continuing without follow-ups):', err);
    return [];
  }
}
