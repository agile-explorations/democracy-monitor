/**
 * Research-mode hybrid fusion (#702/#705): id-only alias arms, weighted RRF
 * against the primary vector pools, single-batch hydration of arm-only
 * winners, URL dedupe, and post-fusion snippet extraction.
 *
 * Arms never materialize content or embeddings — a content prefix on a
 * compressed multi-MB row decompresses the whole row (8 arms x 40 old-era
 * CREC rows measured ~50s on prod before this design).
 */

import type { DocumentTier } from '@/lib/data/document-tiers';
import { tierForSourceType } from '@/lib/data/document-tiers';
import { hashArmParams, runKeyedArms } from './arm-cache';
import { buildAliasArmQuery, fetchMatchSnippets } from './hybrid-arms';
import type { FusionArm } from './hybrid-fusion';
import { armWeight, dedupeByInstrument, dedupeByUrl, fuseWeightedRrf } from './hybrid-fusion';
import type { ValidatedAlias } from './query-expansion-service';
import { expandAndValidate } from './query-expansion-service';
import { fetchResearchDocRowsByIds, researchCandidateFilters } from './research-retrieval';
import type { ResearchDocument } from './search-service';

type MapToResearchDoc = (row: Record<string, unknown>) => ResearchDocument;

/** Lightweight alias-arm hit: fusion runs on ids; winners hydrate later.
 *  Arms must never materialize content/embeddings — a content prefix on a
 *  compressed multi-MB row decompresses the whole row (#705: 8 arms x 40
 *  old-era CREC rows measured ~50s on prod). */
export interface ArmHit {
  id: number;
  sourceType: string;
  matchedAlias?: string;
  matchSnippet?: string;
}

/**
 * Run the per-alias FTS arms for a research window as id-only ranked lists.
 * Alias failures degrade to empty arms; zero aliases (no key, LLM failure,
 * nothing validated) means pure-vector retrieval.
 */
export async function runResearchAliasArms(
  query: string,
  dateFrom?: string,
  dateTo?: string,
  tier?: DocumentTier,
): Promise<{ aliases: ValidatedAlias[]; arms: FusionArm<ArmHit>[] }> {
  const aliases = await expandAndValidate(query, { dateFrom, dateTo, tier });
  if (aliases.length === 0) return { aliases, arms: [] };
  const arms = await runArmsForAliases(aliases, dateFrom, dateTo, tier);
  return { aliases, arms };
}

/** Arm-execution admission ceiling, re-derived empirically (#782 WO-2
 *  sweep, 2026-08-26): phrases with 600+ corpus matches contributed a
 *  final doc in only 28% of instances and just 3 arm-only docs across 50
 *  instances — their RRF weight is too low to surface results, but their
 *  GIN probes are the most expensive. Validation admission (MAX_MATCH_CAP
 *  = 1000, alias-count-cache.ts) is unchanged: broad aliases still count
 *  and display; they just don't RUN as arms. */
export const ARM_MATCH_CEILING = 600;

/** Run keyword arms for already-validated aliases (LLM-proposed or
 *  corpus-mined #750) through the shared per-alias arm cache. Aliases
 *  over ARM_MATCH_CEILING get an empty arm without touching the DB —
 *  the result stays index-aligned with the input (callers map by index). */
export async function runArmsForAliases(
  aliases: ValidatedAlias[],
  dateFrom?: string,
  dateTo?: string,
  tier?: DocumentTier,
): Promise<FusionArm<ArmHit>[]> {
  if (aliases.length === 0) return [];
  const filters = researchCandidateFilters(dateFrom, dateTo, tier);
  const armParams = { dateFrom: dateFrom ?? null, dateTo: dateTo ?? null, tier: tier ?? null };
  const paramsHash = hashArmParams(armParams);
  const runnable = aliases.filter((a) => a.matches <= ARM_MATCH_CEILING);
  const rowLists = await runKeyedArms(
    runnable.map((a) => ({
      kind: 'research' as const,
      phrase: a.phrase,
      paramsHash,
      params: armParams,
      query: buildAliasArmQuery(a, filters),
    })),
  );
  const rowsByPhrase = new Map(runnable.map((a, i) => [a.phrase, rowLists[i]]));
  return aliases.map((a) => ({
    items: (rowsByPhrase.get(a.phrase) ?? []).map((r) => ({
      id: Number(r.id),
      sourceType: r.source_type as string,
      matchedAlias: (r.matched_alias as string) || undefined,
    })),
    weight: armWeight(a.matches),
  }));
}

/**
 * Fuse a primary pool with id-only alias arms, hydrate arm-only winners in
 * one batch (real cosine via the query vector), URL-dedupe, and cut to topK.
 */
export async function fuseHydrateDedupe(
  primary: ResearchDocument[],
  arms: FusionArm<ArmHit>[],
  topK: number,
  vectorStr: string,
  mapToResearchDoc: MapToResearchDoc,
): Promise<ResearchDocument[]> {
  const lightPrimary: ArmHit[] = primary.map((d) => ({ id: d.id, sourceType: d.sourceType }));
  // Fuse to 2x then URL-dedupe (alias arms reintroduce same-url rows the
  // primary arm's DISTINCT ON (url) had collapsed) and refill to topK.
  const fused = fuseWeightedRrf(lightPrimary, arms, topK * 2);
  const byId = new Map(primary.map((d) => [d.id, d]));
  const missing = fused.filter((f) => !byId.has(f.id)).map((f) => f.id);
  if (missing.length > 0) {
    const rows = await fetchResearchDocRowsByIds(missing, vectorStr);
    for (const r of rows) byId.set(Number(r.id), mapToResearchDoc(r));
  }
  const docs: ResearchDocument[] = [];
  for (const f of fused) {
    const d = byId.get(f.id);
    if (!d) continue;
    if (f.matchedAlias && !d.matchedAlias) d.matchedAlias = f.matchedAlias;
    docs.push(d);
  }
  return dedupeByInstrument(dedupeByUrl(docs)).slice(0, topK);
}

/**
 * Batched post-fusion snippet extraction (#702 perf): headlines run only for
 * the keyword-surfaced docs that made the final list, not every arm candidate.
 */
export async function attachMatchSnippets(docs: ResearchDocument[]): Promise<ResearchDocument[]> {
  const pending = docs.filter((d) => d.matchedAlias && !d.matchSnippet);
  if (pending.length === 0) return docs;
  const snippets = await fetchMatchSnippets(
    pending.map((d) => ({ id: d.id, phrase: d.matchedAlias as string })),
  );
  for (const d of pending) {
    const snippet = snippets.get(d.id);
    if (snippet) d.matchSnippet = snippet;
  }
  return docs;
}

/** Restrict fusion arms to one tier (order-preserving) for the tiered pools. */
export function armsForTier(arms: FusionArm<ArmHit>[], tier: DocumentTier): FusionArm<ArmHit>[] {
  return arms.map((a) => ({
    items: a.items.filter((h) => tierForSourceType(h.sourceType) === tier),
    weight: a.weight,
  }));
}
