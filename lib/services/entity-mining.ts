/**
 * Corpus-mined entity aliases — pseudo-relevance feedback (#750).
 *
 * The LLM expansion (#733) cannot name entities from after its knowledge
 * cutoff; the vector candidates' own text can. Mine captions/order numbers/
 * operations from the pooled candidates (extraction: entity-extraction.ts,
 * LIGHT config — bit-identical to the v1.10.1 shipped behavior; the widened
 * settings ran in this common path once and destabilized prod, #756),
 * validate like any alias, and run them as extra arms.
 *
 * Two halves (#782 WO-5): extraction needs only the vector candidates, so
 * the seed runs it while the LLM expansion is still validating; the
 * known-phrase filter + validation + arms need the validated LLM aliases
 * and run once those exist. Same inputs at every decision point as the
 * former single pass.
 *
 * Failure-tolerant: any error degrades to zero mined aliases and retrieval
 * proceeds on vector + LLM arms alone. Excluded from unit coverage (DB +
 * arm I/O); the extraction half is fully unit-tested.
 */

import { sql } from 'drizzle-orm';
import type { DocumentTier } from '@/lib/data/document-tiers';
import { getDb, isDbAvailable } from '@/lib/db';
import { dbWorkGate } from '@/lib/services/db-work-gate';
import {
  extractEntityPhrases,
  LIGHT_EXTRACTION,
  MINING_CANDIDATE_LIMIT,
} from '@/lib/services/entity-extraction';
import type { ExtractionConfig } from '@/lib/services/entity-extraction';
import type { FusionArm } from '@/lib/services/hybrid-fusion';
import type { ExpansionWindow, ValidatedAlias } from '@/lib/services/query-expansion-service';
import { validateAliasesDiagnostic } from '@/lib/services/query-expansion-service';
import type { ArmHit } from '@/lib/services/research-fusion';
import { runArmsForAliases } from '@/lib/services/research-fusion';

/** Entity phrases extracted from candidate texts, before the known-phrase
 *  filter — the output of the first half. */
export type ExtractedPhrases = ReturnType<typeof extractEntityPhrases>;

export interface MinedArms {
  minedAliases: ValidatedAlias[];
  minedArms: FusionArm<ArmHit>[];
}

const NO_MINED_ARMS: MinedArms = { minedAliases: [], minedArms: [] };

/** Unique finite candidate ids, capped at the mining limit. */
function candidateIdsOf(rows: Array<Record<string, unknown>>): number[] {
  return [...new Set(rows.map((r) => Number(r.id)).filter(Number.isFinite))].slice(
    0,
    MINING_CANDIDATE_LIMIT,
  );
}

/** First half: fetch the candidates' title + content prefix and extract
 *  entity phrases. Needs no alias knowledge, so it overlaps expansion. */
async function fetchAndExtract(
  candidateIds: number[],
  config: ExtractionConfig,
): Promise<ExtractedPhrases> {
  if (!isDbAvailable() || candidateIds.length === 0) return [];
  const db = getDb();
  const ids = candidateIds.slice(0, MINING_CANDIDATE_LIMIT);
  const rows = await dbWorkGate(() =>
    db.execute(sql`
    SELECT d.title, LEFT(d.content, ${config.contentChars}) as body
    FROM documents d
    WHERE d.id IN (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )})`),
  );
  const texts = (rows.rows as Array<{ title: string | null; body: string | null }>).map(
    (r) => `${r.title ?? ''}\n${r.body ?? ''}`,
  );
  return extractEntityPhrases(texts, config);
}

/** Second half: drop phrases the LLM expansion already searches, apply the
 *  config's slice discipline, validate through the standard alias
 *  machinery. LIGHT keeps v1.10.1 semantics byte-identically (cap to
 *  maxPhrases BEFORE validation); ENUM (#762) forwards validationCandidates
 *  phrases and slices VALIDATED aliases to maxPhrases instead. */
async function filterAndValidate(
  extracted: ExtractedPhrases,
  existing: ValidatedAlias[],
  window: ExpansionWindow,
  config: ExtractionConfig,
): Promise<ValidatedAlias[]> {
  if (!isDbAvailable()) return [];
  const known = new Set(existing.map((a) => a.phrase.toLowerCase()));
  const novel = extracted.filter((e) => !known.has(e.phrase.toLowerCase()));
  const phrases = (
    config.sliceBeforeValidate
      ? novel.slice(0, config.maxPhrases)
      : novel.slice(0, config.validationCandidates)
  ).map((e) => e.phrase);
  if (phrases.length === 0) return [];
  const { validated } = await validateAliasesDiagnostic(phrases, window);
  return config.sliceBeforeValidate ? validated : validated.slice(0, config.maxPhrases);
}

/** Extraction half for the seed DAG (#782 WO-5). Failure degrades to no
 *  phrases, i.e. no mined arms. */
export async function extractMiningPhrases(
  rows: Array<Record<string, unknown>>,
  config: ExtractionConfig = LIGHT_EXTRACTION,
): Promise<ExtractedPhrases> {
  try {
    return await fetchAndExtract(candidateIdsOf(rows), config);
  } catch (err) {
    console.warn('[entity-mining] extraction failed (continuing without mined arms):', err);
    return [];
  }
}

/** Validation + arms half for the seed DAG (#782 WO-5). Failure-tolerant —
 *  any error degrades to zero mined arms. */
export async function validateAndRunMined(
  extracted: ExtractedPhrases,
  existing: ValidatedAlias[],
  window: ExpansionWindow,
  config: ExtractionConfig = LIGHT_EXTRACTION,
): Promise<MinedArms> {
  try {
    const minedAliases = await filterAndValidate(extracted, existing, window, config);
    const minedArms = await runArmsForAliases(
      minedAliases,
      window.dateFrom,
      window.dateTo,
      window.tier,
    );
    return { minedAliases, minedArms };
  } catch (err) {
    console.warn('[entity-mining] failed (continuing without mined arms):', err);
    return NO_MINED_ARMS;
  }
}

/** The full pseudo-relevance-feedback step in one call: mine entity
 *  phrases from vector candidates, validate, and run them as extra arms.
 *  Failure-tolerant — any error degrades to zero mined arms. */
export async function mineArmsFromCandidates(
  rows: Array<Record<string, unknown>>,
  aliases: ValidatedAlias[],
  dateFrom?: string,
  dateTo?: string,
  tier?: DocumentTier,
  config: ExtractionConfig = LIGHT_EXTRACTION,
): Promise<MinedArms> {
  const extracted = await extractMiningPhrases(rows, config);
  return validateAndRunMined(extracted, aliases, { dateFrom, dateTo, tier }, config);
}
