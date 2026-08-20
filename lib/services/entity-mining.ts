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
 * Failure-tolerant: any error degrades to zero mined aliases and retrieval
 * proceeds on vector + LLM arms alone. Excluded from unit coverage (DB +
 * arm I/O); the extraction half is fully unit-tested.
 */

import { sql } from 'drizzle-orm';
import type { DocumentTier } from '@/lib/data/document-tiers';
import { getDb, isDbAvailable } from '@/lib/db';
import {
  extractEntityPhrases,
  LIGHT_EXTRACTION,
  MINING_CANDIDATE_LIMIT,
} from '@/lib/services/entity-extraction';
import type { FusionArm } from '@/lib/services/hybrid-fusion';
import type { ExpansionWindow, ValidatedAlias } from '@/lib/services/query-expansion-service';
import { validateAliasesDiagnostic } from '@/lib/services/query-expansion-service';
import type { ArmHit } from '@/lib/services/research-fusion';
import { runArmsForAliases } from '@/lib/services/research-fusion';

/**
 * Mine entity phrases from the given candidate documents and validate them
 * through the standard alias machinery (match caps, count cache,
 * boilerplate filter). `existing` phrases (the LLM aliases) are skipped.
 * v1.10.1 semantics: cap to maxPhrases BEFORE validation.
 */
export async function mineEntityAliases(
  candidateIds: number[],
  existing: ValidatedAlias[],
  window: ExpansionWindow,
): Promise<ValidatedAlias[]> {
  if (!isDbAvailable() || candidateIds.length === 0) return [];
  const db = getDb();
  const ids = candidateIds.slice(0, MINING_CANDIDATE_LIMIT);
  const rows = await db.execute(sql`
    SELECT d.title, LEFT(d.content, ${LIGHT_EXTRACTION.contentChars}) as body
    FROM documents d
    WHERE d.id IN (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )})`);
  const texts = (rows.rows as Array<{ title: string | null; body: string | null }>).map(
    (r) => `${r.title ?? ''}\n${r.body ?? ''}`,
  );
  const known = new Set(existing.map((a) => a.phrase.toLowerCase()));
  const phrases = extractEntityPhrases(texts, LIGHT_EXTRACTION)
    .filter((e) => !known.has(e.phrase.toLowerCase()))
    .slice(0, LIGHT_EXTRACTION.maxPhrases)
    .map((e) => e.phrase);
  if (phrases.length === 0) return [];
  return (await validateAliasesDiagnostic(phrases, window)).validated;
}

/** The full pseudo-relevance-feedback step: mine entity phrases from vector
 *  candidates, validate, and run them as extra arms. Failure-tolerant —
 *  any error degrades to zero mined arms. */
export async function mineArmsFromCandidates(
  rows: Array<Record<string, unknown>>,
  aliases: ValidatedAlias[],
  dateFrom?: string,
  dateTo?: string,
  tier?: DocumentTier,
): Promise<{ minedAliases: ValidatedAlias[]; minedArms: FusionArm<ArmHit>[] }> {
  try {
    const candidateIds = [...new Set(rows.map((r) => Number(r.id)).filter(Number.isFinite))].slice(
      0,
      MINING_CANDIDATE_LIMIT,
    );
    const minedAliases = await mineEntityAliases(candidateIds, aliases, { dateFrom, dateTo, tier });
    const minedArms = await runArmsForAliases(minedAliases, dateFrom, dateTo, tier);
    return { minedAliases, minedArms };
  } catch (err) {
    console.warn('[entity-mining] failed (continuing without mined arms):', err);
    return { minedAliases: [], minedArms: [] };
  }
}
