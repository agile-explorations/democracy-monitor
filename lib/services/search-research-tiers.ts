/**
 * Research seed-sweep tier functions (#702/#750/#780), split from
 * search-service.ts for single responsibility: the single-tier and
 * all-tiers candidate pools with LLM + corpus-mined arms, plus the
 * seed-internal stage timing channel (#780 WP1b).
 */

import { composeTieredResults } from '@/lib/data/document-tiers';
import type { DocumentTier } from '@/lib/data/document-tiers';
import type { getDb } from '@/lib/db';
import type { ExtractionConfig } from '@/lib/services/entity-extraction';
import { mineArmsFromCandidates } from '@/lib/services/entity-mining';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';
import {
  armsForTier,
  attachMatchSnippets,
  fuseHydrateDedupe,
  runArmsForAliases,
  runResearchAliasArms,
} from '@/lib/services/research-fusion';
import { buildResearchQuery } from '@/lib/services/research-retrieval';
import type { ResearchDocument } from '@/lib/services/search-service';
import { mapToResearchDoc } from '@/lib/services/search-service';
import { executeFilteredVectorQuery } from '@/lib/services/vector-expr';

/** Structurally WindowTiming (research-retrieval-helpers) — declared
 *  locally to avoid an import cycle. Seed-internal stage rows (#780 WP1b):
 *  the seed sweep measured 116s of a 129s warm-index build with zero
 *  attribution inside it. */
export type SeedStageTiming = { key: string; searchMs: number; rerankMs: number };

export async function timedStage<T>(
  key: string,
  sink: SeedStageTiming[] | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  if (!sink) return fn();
  const t0 = Date.now();
  const out = await fn();
  sink.push({ key, searchMs: Date.now() - t0, rerankMs: 0 });
  return out;
}

/** Single-tier research pool with LLM + corpus-mined arms (#702/#750). */
export async function searchSingleTierWithMeta(
  db: ReturnType<typeof getDb>,
  query: string,
  vectorStr: string,
  topK: number,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  tier: DocumentTier,
  extraAliases?: ValidatedAlias[],
  miningConfig?: ExtractionConfig,
): Promise<{ documents: ResearchDocument[]; minedAliases: ValidatedAlias[] }> {
  const [results, { aliases, arms }, extraArms] = await Promise.all([
    executeFilteredVectorQuery(
      db,
      buildResearchQuery(vectorStr, query, { topK, dateFrom, dateTo, tier }),
    ),
    runResearchAliasArms(query, dateFrom, dateTo, tier),
    runArmsForAliases(extraAliases ?? [], dateFrom, dateTo, tier),
  ]);
  const rows = results.rows as Record<string, unknown>[];
  const { minedAliases, minedArms } = await mineArmsFromCandidates(
    rows,
    [...aliases, ...(extraAliases ?? [])],
    dateFrom,
    dateTo,
    tier,
    miningConfig,
  );
  const documents = await attachMatchSnippets(
    await fuseHydrateDedupe(
      rows.map(mapToResearchDoc),
      [...arms, ...minedArms, ...extraArms],
      topK,
      vectorStr,
      mapToResearchDoc,
    ),
  );
  return { documents, minedAliases };
}

/**
 * Per-tier candidate pools: primary sources must not be crowded out of a
 * shared pool by debate-style text that embeds closer to question phrasing.
 * Alias arms run once tier-unfiltered, then split by tier so each pool fuses
 * only with its own tier's keyword hits (#702).
 */

/** The seed's parallel candidate block; each component timed individually
 *  so durations attribute even though wall-clock overlaps (#780 WP1b). */
function gatherSeedCandidates(
  db: ReturnType<typeof getDb>,
  query: string,
  vectorStr: string,
  w: { topK: number; dateFrom?: string; dateTo?: string },
  extraAliases: ValidatedAlias[] | undefined,
  stageSink?: SeedStageTiming[],
) {
  return Promise.all([
    timedStage('seed-vector-action', stageSink, () =>
      executeFilteredVectorQuery(
        db,
        buildResearchQuery(vectorStr, query, { ...w, tier: 'action' }),
      ),
    ),
    timedStage('seed-vector-discussion', stageSink, () =>
      executeFilteredVectorQuery(
        db,
        buildResearchQuery(vectorStr, query, { ...w, tier: 'discussion' }),
      ),
    ),
    timedStage('seed-alias-arms', stageSink, () =>
      runResearchAliasArms(query, w.dateFrom, w.dateTo),
    ),
    timedStage('seed-extra-arms', stageSink, () =>
      runArmsForAliases(extraAliases ?? [], w.dateFrom, w.dateTo),
    ),
  ]);
}

export async function searchResearchAllTiers(
  db: ReturnType<typeof getDb>,
  query: string,
  vectorStr: string,
  topK: number,
  dateFrom?: string,
  dateTo?: string,
  extraAliases?: ValidatedAlias[],
  miningConfig?: ExtractionConfig,
  stageSink?: SeedStageTiming[],
): Promise<{ documents: ResearchDocument[]; minedAliases: ValidatedAlias[] }> {
  const [actionRows, discussionRows, { aliases, arms }, extraArms] = await gatherSeedCandidates(
    db,
    query,
    vectorStr,
    { topK, dateFrom, dateTo },
    extraAliases,
    stageSink,
  );
  // Pseudo-relevance feedback (#750): the LLM expansion cannot name
  // post-cutoff entities, but the vector candidates' own text can. Mine
  // captions/order numbers/operations from the pooled candidates, validate
  // like any alias, and run them as extra arms. Failure degrades to none.
  const { minedAliases, minedArms } = await timedStage('seed-mining', stageSink, () =>
    mineArmsFromCandidates(
      [
        ...(actionRows.rows as Record<string, unknown>[]),
        ...(discussionRows.rows as Record<string, unknown>[]),
      ],
      [...aliases, ...(extraAliases ?? [])],
      dateFrom,
      dateTo,
      undefined,
      miningConfig,
    ),
  );
  const allArms = [...arms, ...minedArms, ...extraArms];
  const fusePool = (rows: Record<string, unknown>[], tier: DocumentTier) =>
    fuseHydrateDedupe(
      rows.map(mapToResearchDoc),
      armsForTier(allArms, tier),
      topK,
      vectorStr,
      mapToResearchDoc,
    );
  const [action, discussion] = await timedStage('seed-fuse-hydrate', stageSink, () =>
    Promise.all([
      fusePool(actionRows.rows as Record<string, unknown>[], 'action'),
      fusePool(discussionRows.rows as Record<string, unknown>[], 'discussion'),
    ]),
  );
  return { documents: composeTieredResults(action, discussion, topK), minedAliases };
}
