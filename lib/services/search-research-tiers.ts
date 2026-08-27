/**
 * Research seed-sweep tier functions (#702/#750/#780), split from
 * search-service.ts for single responsibility: the single-tier and
 * all-tiers candidate pools with LLM + corpus-mined arms, plus the
 * seed-internal stage timing channel (#780 WP1b).
 *
 * Stage overlap (#782 WO-5): after the LLM expansion (which runs alone),
 * the LLM-alias arms run alongside the vector queries → mining extraction →
 * mined validation + mined arms. Every stage receives exactly the inputs it
 * received when the stages ran in series — only the scheduling changed.
 */

import { composeTieredResults } from '@/lib/data/document-tiers';
import type { DocumentTier } from '@/lib/data/document-tiers';
import type { getDb } from '@/lib/db';
import type { ExtractionConfig } from '@/lib/services/entity-extraction';
import { extractMiningPhrases, validateAndRunMined } from '@/lib/services/entity-mining';
import type { MinedArms } from '@/lib/services/entity-mining';
import type { FusionArm } from '@/lib/services/hybrid-fusion';
import { expandAndValidate } from '@/lib/services/query-expansion-service';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';
import {
  armsForTier,
  attachMatchSnippets,
  fuseHydrateDedupe,
  runArmsForAliases,
} from '@/lib/services/research-fusion';
import type { ArmHit } from '@/lib/services/research-fusion';
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

type Db = ReturnType<typeof getDb>;
type Rows = Record<string, unknown>[];

interface SeedWindow {
  topK: number;
  dateFrom?: string;
  dateTo?: string;
  /** Tier of the arms/expansion window; undefined = tier-unfiltered. */
  tier?: DocumentTier;
}

interface SeedResult {
  /** One row set per requested vector tier, in request order. */
  vectorRows: Rows[];
  /** [LLM arms, mined arms, extra arms] — the fusion order the serial seed used. */
  allArms: FusionArm<ArmHit>[];
  minedAliases: ValidatedAlias[];
}

/** A promise that may settle before anything awaits it must not surface as
 *  an unhandled rejection (Node terminates the process) — mark it observed;
 *  the later Promise.all still receives the rejection. */
function observed<T>(p: Promise<T>): Promise<T> {
  p.catch(() => undefined);
  return p;
}

interface SeedRequest {
  db: Db;
  query: string;
  vectorStr: string;
  window: SeedWindow;
  /** Vector pools to fetch, one query each. */
  vectorTiers: DocumentTier[];
  extraAliases: ValidatedAlias[];
  miningConfig: ExtractionConfig | undefined;
  sink?: SeedStageTiming[];
}

type VectorResults = Array<{ rows: unknown[] }>;

/** vectors → mining extraction → mined validation + mined arms; the mined
 *  known-filter sees the validated LLM aliases plus the extra aliases. */
function startMiningChain(
  r: SeedRequest,
  aliases: ValidatedAlias[],
  vectorP: Promise<VectorResults>,
): Promise<MinedArms> {
  const { dateFrom, dateTo, tier } = r.window;
  return observed(
    vectorP
      .then((results) =>
        timedStage('seed-mining-prep', r.sink, () =>
          extractMiningPhrases(
            results.flatMap((v) => v.rows as Rows),
            r.miningConfig,
          ),
        ),
      )
      .then((extracted) =>
        timedStage('seed-mining', r.sink, () =>
          validateAndRunMined(
            extracted,
            [...aliases, ...r.extraAliases],
            { dateFrom, dateTo, tier },
            r.miningConfig,
          ),
        ),
      ),
  );
}

/**
 * The seed DAG (#782 WO-5, final shape):
 *
 *   expansion (alone) → [LLM-alias arms ∥ extra arms ∥ vectors → mining extraction → mined validation → mined arms]
 *
 * Expansion runs FIRST and alone: its validation counts are CPU-bound on
 * the 2-vCPU tier and lose more to contention with the vector scans than
 * overlapping them saves (probe 1b, four cold runs). The second half
 * overlaps under the request's DB budget — the part that let the heaviest
 * probe finish inside the client budget for the first time.
 */
async function runSeedDag(r: SeedRequest): Promise<SeedResult> {
  const { dateFrom, dateTo, tier, topK } = r.window;
  const aliases = await timedStage('seed-expansion', r.sink, () =>
    expandAndValidate(r.query, { dateFrom, dateTo, tier }),
  );
  const vectorP: Promise<VectorResults> = observed(
    Promise.all(
      r.vectorTiers.map((vt) =>
        timedStage(`seed-vector-${vt}`, r.sink, () =>
          executeFilteredVectorQuery(
            r.db,
            buildResearchQuery(r.vectorStr, r.query, { topK, dateFrom, dateTo, tier: vt }),
          ),
        ),
      ),
    ),
  );
  const minedP = startMiningChain(r, aliases, vectorP);
  const [arms, extraArms, mined, vectorResults] = await Promise.all([
    timedStage('seed-alias-arms', r.sink, () => runArmsForAliases(aliases, dateFrom, dateTo, tier)),
    timedStage('seed-extra-arms', r.sink, () =>
      runArmsForAliases(r.extraAliases, dateFrom, dateTo, tier),
    ),
    minedP,
    vectorP,
  ]);
  return {
    vectorRows: vectorResults.map((v) => v.rows as Rows),
    allArms: [...arms, ...mined.minedArms, ...extraArms],
    minedAliases: mined.minedAliases,
  };
}

/** Single-tier research pool with LLM + corpus-mined arms (#702/#750). */
export async function searchSingleTierWithMeta(
  db: Db,
  query: string,
  vectorStr: string,
  topK: number,
  dateFrom: string | undefined,
  dateTo: string | undefined,
  tier: DocumentTier,
  extraAliases?: ValidatedAlias[],
  miningConfig?: ExtractionConfig,
  stageSink?: SeedStageTiming[],
): Promise<{ documents: ResearchDocument[]; minedAliases: ValidatedAlias[] }> {
  const seed = await runSeedDag({
    db,
    query,
    vectorStr,
    window: { topK, dateFrom, dateTo, tier },
    vectorTiers: [tier],
    extraAliases: extraAliases ?? [],
    miningConfig,
    sink: stageSink,
  });
  const documents = await attachMatchSnippets(
    await fuseHydrateDedupe(
      seed.vectorRows[0].map(mapToResearchDoc),
      seed.allArms,
      topK,
      vectorStr,
      mapToResearchDoc,
    ),
  );
  return { documents, minedAliases: seed.minedAliases };
}

/**
 * Per-tier candidate pools: primary sources must not be crowded out of a
 * shared pool by debate-style text that embeds closer to question phrasing.
 * Alias arms run once tier-unfiltered, then split by tier so each pool fuses
 * only with its own tier's keyword hits (#702). Pseudo-relevance feedback
 * (#750): the LLM expansion cannot name post-cutoff entities, but the vector
 * candidates' own text can — mined phrases validate like any alias and run
 * as extra arms.
 */
export async function searchResearchAllTiers(
  db: Db,
  query: string,
  vectorStr: string,
  topK: number,
  dateFrom?: string,
  dateTo?: string,
  extraAliases?: ValidatedAlias[],
  miningConfig?: ExtractionConfig,
  stageSink?: SeedStageTiming[],
): Promise<{ documents: ResearchDocument[]; minedAliases: ValidatedAlias[] }> {
  const seed = await runSeedDag({
    db,
    query,
    vectorStr,
    window: { topK, dateFrom, dateTo },
    vectorTiers: ['action', 'discussion'],
    extraAliases: extraAliases ?? [],
    miningConfig,
    sink: stageSink,
  });
  const [actionRows, discussionRows] = seed.vectorRows;
  const fusePool = (rows: Rows, tier: DocumentTier) =>
    fuseHydrateDedupe(
      rows.map(mapToResearchDoc),
      armsForTier(seed.allArms, tier),
      topK,
      vectorStr,
      mapToResearchDoc,
    );
  const [action, discussion] = await timedStage('seed-fuse-hydrate', stageSink, () =>
    Promise.all([fusePool(actionRows, 'action'), fusePool(discussionRows, 'discussion')]),
  );
  return {
    documents: composeTieredResults(action, discussion, topK),
    minedAliases: seed.minedAliases,
  };
}
