/**
 * Corpus-mined entity aliases — pseudo-relevance feedback (#750).
 *
 * The LLM expansion (#733) cannot name entities from after its knowledge
 * cutoff: asked about 2025-26 litigation it proposes Zadvydas v. Davis
 * (2001), never Newsom v. Trump. The corpus itself has no cutoff — the top
 * vector candidates' own text names the captions, order numbers, and
 * operations the question is about. Mine those (extraction lives in
 * entity-extraction.ts), validate them exactly like LLM aliases, and run
 * them as ordinary keyword arms.
 *
 * Failure-tolerant like the rest of expansion: any error degrades to zero
 * mined aliases and retrieval proceeds on vector + LLM arms alone.
 * Excluded from unit coverage (DB + arm I/O); the extraction half is fully
 * unit-tested.
 */

import { sql } from 'drizzle-orm';
import type { DocumentTier } from '@/lib/data/document-tiers';
import { getDb, isDbAvailable } from '@/lib/db';
import {
  extractEntityPhrases,
  MAX_MINED_PHRASES,
  MINING_CANDIDATE_LIMIT,
  MINING_CONTENT_CHARS,
  MINING_VALIDATION_CANDIDATES,
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
    SELECT d.title, LEFT(d.content, ${MINING_CONTENT_CHARS}) as body
    FROM documents d
    WHERE d.id IN (${sql.join(
      ids.map((i) => sql`${i}`),
      sql`, `,
    )})`);
  const texts = (rows.rows as Array<{ title: string | null; body: string | null }>).map(
    (r) => `${r.title ?? ''}\n${r.body ?? ''}`,
  );
  const known = new Set(existing.map((a) => a.phrase.toLowerCase()));
  // Validate WIDE, slice AFTER (#753): doc-frequency ranks ubiquitous
  // statutes first, and slicing before validation let them consume every
  // slot only to die at the match cap — starving the freq-1 captions the
  // mining exists to find. Validation is week-cached per phrase, so the
  // wider list costs one cold count per novel phrase.
  const phrases = extractEntityPhrases(texts)
    .filter((e) => !known.has(e.phrase.toLowerCase()))
    .slice(0, MINING_VALIDATION_CANDIDATES)
    .map((e) => e.phrase);
  if (phrases.length === 0) return [];
  const { validated } = await validateAliasesDiagnostic(phrases, window);
  return validated.slice(0, MAX_MINED_PHRASES);
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
