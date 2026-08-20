/**
 * Weekly hot-entity salience index refresh (#757, per-era #760).
 *
 * One sweep over ALL analysis-period documents, accumulated per era
 * (trump_t1 / biden / trump_t2); each era's entities are ranked by
 * CROSS-era novelty (recurrence in this era ÷ recurrence in the others —
 * era-invariant legal boilerplate collapses in every era symmetrically),
 * validated through the alias machinery, and full-replaced into
 * hot_entities + hot_entity_docs.
 *
 * Validation reuse (#760, pre-cron fix): corpus FTS counts are stored on
 * the table and reused by phrase across refreshes — only NOVEL phrases pay
 * a cold count. Without this, every Monday re-paid ~75 minutes of cold
 * counts inside the 03:00→05:00 snapshot-to-dump window (the alias-count
 * cache is week-keyed).
 *
 * Usage:
 *   pnpm entities:refresh [--dry-run] [--max-docs=N]
 *
 * Also runs as a non-fatal snapshot post-step (tryRefreshHotEntities).
 * Coverage-excluded I/O; pure merge/ranking logic is unit-tested in
 * lib/services/hot-entity-ranking.ts.
 */

import { and, isNotNull, sql } from 'drizzle-orm';
import {
  buildActiveSourceCondition,
  buildAnalysisPeriodCondition,
} from '@/lib/data/analysis-periods';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents, hotEntities, hotEntityDocs } from '@/lib/db/schema';
import { dataWeekStamp } from '@/lib/services/arm-cache';
import { extractEntityPhrases, WIDE_EXTRACTION } from '@/lib/services/entity-extraction';
import type { EntityEra, HotEntityEntry } from '@/lib/services/hot-entity-ranking';
import {
  applyCrossEraFrequencies,
  ENTITY_ERAS,
  eraForDate,
  MAX_HOT_ENTITIES,
  MAX_HOT_ENTITIES_BASELINE_ERA,
  mergeDocExtraction,
  rankHotEntities,
  RECENT_WINDOW_WEEKS,
  topCategories,
} from '@/lib/services/hot-entity-ranking';
import { validateAliasesDiagnostic } from '@/lib/services/query-expansion-service';
import type { ValidatedAlias } from '@/lib/services/query-expansion-service';
import { checkHelp } from '@/lib/utils/cli-help';

const BATCH_SIZE = 2000;
/** Phrases per validation chunk (each novel phrase = one cached FTS count). */
const VALIDATION_CHUNK = 50;

interface RefreshOptions {
  dryRun: boolean;
  maxDocs?: number;
}

interface RefreshResult {
  docsScanned: number;
  phrasesExtracted: number;
  ranked: number;
  validated: number;
  freshCounts: number;
  written: number;
  junctionRows: number;
}

type EraAccumulators = Record<EntityEra, Map<string, HotEntityEntry>>;

function emptyAccumulators(): EraAccumulators {
  return { trump_t1: new Map(), biden: new Map(), trump_t2: new Map() };
}

/** One batched id-range sweep over every analysis-period doc, merged into
 *  the accumulator of the doc's era. Texts are never accumulated. */
async function sweepAllEras(accs: EraAccumulators, maxDocs?: number): Promise<number> {
  // nosemgrep: opengrep.cron-needs-env-config
  const db = getDb();
  const scope = and(
    buildAnalysisPeriodCondition(documents.publishedAt),
    buildActiveSourceCondition(documents.sourceOrigin),
    isNotNull(documents.content),
    sql`${documents.retrievalRelevant} IS NOT FALSE`,
    sql`${documents.contentType} != 'metadata_only'`,
  );
  const bounds = await db
    .select({ lo: sql<number>`min(${documents.id})`, hi: sql<number>`max(${documents.id})` })
    .from(documents)
    .where(scope);
  const { lo, hi } = bounds[0] ?? { lo: null, hi: null };
  if (lo == null || hi == null) return 0;

  const recentCutoff = new Date(Date.now() - RECENT_WINDOW_WEEKS * 7 * 86400_000).toISOString();
  let scanned = 0;
  let batches = 0;
  for (let start = lo; start <= hi; start += BATCH_SIZE) {
    const rows = await db
      .select({
        id: documents.id,
        title: documents.title,
        publishedAt: sql<string | null>`${documents.publishedAt}::text`,
        category: documents.category,
        body: sql<string>`LEFT(${documents.content}, ${WIDE_EXTRACTION.contentChars})`,
      })
      .from(documents)
      .where(
        and(scope, sql`${documents.id} >= ${start} AND ${documents.id} < ${start + BATCH_SIZE}`),
      );
    for (const row of rows) {
      const phrases = extractEntityPhrases([`${row.title}\n${row.body}`], {
        ...WIDE_EXTRACTION,
        minDocFrequency: 1,
      });
      mergeDocExtraction(accs[eraForDate(row.publishedAt)], row, phrases, recentCutoff);
      scanned++;
      if (maxDocs && scanned >= maxDocs) return scanned;
    }
    batches++;
    if (batches % 25 === 0) console.log(`[hot-entities] scanned ${scanned} docs`);
  }
  return scanned;
}

/** Corpus FTS counts, reusing stored values (#760): counts are corpus-wide
 *  and phrase-keyed, so any prior row's count serves every era. */
async function resolveFtsCounts(
  phrases: string[],
): Promise<{ counts: Map<string, number>; freshCounts: number }> {
  // nosemgrep: opengrep.cron-needs-env-config
  const db = getDb();
  const stored = await db
    .select({ phrase: hotEntities.phrase, ftsMatches: hotEntities.ftsMatches })
    .from(hotEntities);
  const counts = new Map<string, number>();
  for (const s of stored) {
    if (s.ftsMatches > 0) counts.set(s.phrase.toLowerCase(), s.ftsMatches);
  }
  const novel = [...new Set(phrases.map((p) => p.toLowerCase()))].filter((p) => !counts.has(p));
  const novelOriginal = phrases.filter((p) => novel.includes(p.toLowerCase()));
  const unique = [...new Map(novelOriginal.map((p) => [p.toLowerCase(), p])).values()];
  let done = 0;
  for (let i = 0; i < unique.length; i += VALIDATION_CHUNK) {
    const chunk = unique.slice(i, i + VALIDATION_CHUNK);
    const { validated } = await validateAliasesDiagnostic(chunk, {});
    for (const v of validated as ValidatedAlias[]) counts.set(v.phrase.toLowerCase(), v.matches);
    done += chunk.length;
    if (done % 250 < VALIDATION_CHUNK) {
      console.log(`[hot-entities] validated ${done}/${unique.length} novel phrases`);
    }
  }
  return { counts, freshCounts: unique.length };
}

/** Full-replace the index for this week's ranked, validated entities. */
async function writeIndex(
  rankedByEra: Record<EntityEra, HotEntityEntry[]>,
  counts: Map<string, number>,
): Promise<{ written: number; junctionRows: number; weekStamp: string }> {
  // nosemgrep: opengrep.cron-needs-env-config
  const db = getDb();
  const weekStamp = dataWeekStamp();
  let written = 0;
  let junctionRows = 0;
  await db.transaction(async (tx) => {
    await tx.delete(hotEntities);
    for (const era of ENTITY_ERAS) {
      const validated = rankedByEra[era].filter(
        (e) => (counts.get(e.phrase.toLowerCase()) ?? 0) > 0,
      );
      for (let i = 0; i < validated.length; i += 200) {
        const chunk = validated.slice(i, i + 200);
        const inserted = await tx
          .insert(hotEntities)
          .values(
            chunk.map((e) => ({
              phrase: e.phrase,
              era,
              entityClass: e.entityClass,
              docFreqTerm: e.docFreqTerm,
              docFreqBaseline: e.docFreqBaseline,
              ftsMatches: counts.get(e.phrase.toLowerCase()) ?? 0,
              categories: topCategories(e),
              weekStamp,
              updatedAt: new Date(),
            })),
          )
          .returning({ id: hotEntities.id, phrase: hotEntities.phrase });
        const idByPhrase = new Map(inserted.map((r) => [r.phrase.toLowerCase(), r.id]));
        const junction = chunk.flatMap((e) => {
          const entityId = idByPhrase.get(e.phrase.toLowerCase());
          if (!entityId) return [];
          return e.mentionDocIds.map((docId) => ({ entityId, docId }));
        });
        for (let k = 0; k < junction.length; k += 1000) {
          await tx.insert(hotEntityDocs).values(junction.slice(k, k + 1000));
        }
        written += chunk.length;
        junctionRows += junction.length;
      }
    }
  });
  return { written, junctionRows, weekStamp };
}

export async function refreshHotEntities(opts: RefreshOptions): Promise<RefreshResult> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const t0 = Date.now();
  const accs = emptyAccumulators();
  const docsScanned = await sweepAllEras(accs, opts.maxDocs);
  applyCrossEraFrequencies(accs);
  const rankedByEra = Object.fromEntries(
    ENTITY_ERAS.map((era) => [
      era,
      rankHotEntities(
        accs[era],
        WIDE_EXTRACTION.minDocFrequency,
        era === 'trump_t2' ? MAX_HOT_ENTITIES : MAX_HOT_ENTITIES_BASELINE_ERA,
      ),
    ]),
  ) as Record<EntityEra, HotEntityEntry[]>;
  const phrasesExtracted = ENTITY_ERAS.reduce((n, era) => n + accs[era].size, 0);
  const rankedTotal = ENTITY_ERAS.reduce((n, era) => n + rankedByEra[era].length, 0);
  console.log(
    `[hot-entities] scanned=${docsScanned} phrases=${phrasesExtracted} ranked=${ENTITY_ERAS.map(
      (e) => `${e}:${rankedByEra[e].length}`,
    ).join(' ')} (${Math.round((Date.now() - t0) / 1000)}s)`,
  );
  if (opts.dryRun) {
    for (const era of ENTITY_ERAS) {
      console.log(`[hot-entities] dry run — ${era} top 10:`);
      for (const e of rankedByEra[era].slice(0, 10)) {
        console.log(
          `   ${e.phrase} [${e.entityClass}] era=${e.docFreqTerm} others=${e.docFreqBaseline}`,
        );
      }
    }
    return {
      docsScanned,
      phrasesExtracted,
      ranked: rankedTotal,
      validated: 0,
      freshCounts: 0,
      written: 0,
      junctionRows: 0,
    };
  }

  const allPhrases = ENTITY_ERAS.flatMap((era) => rankedByEra[era].map((e) => e.phrase));
  const { counts, freshCounts } = await resolveFtsCounts(allPhrases);

  const w = await writeIndex(rankedByEra, counts);
  const { written, junctionRows, weekStamp } = w;
  console.log(
    `[hot-entities] wrote ${written} entity rows (+${junctionRows} mention rows, ${freshCounts} fresh counts) for week ${weekStamp} in ${Math.round((Date.now() - t0) / 1000)}s`,
  );
  return {
    docsScanned,
    phrasesExtracted,
    ranked: rankedTotal,
    validated: written,
    freshCounts,
    written,
    junctionRows,
  };
}

// CLI entry
if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv,
    'Refresh the hot-entity salience index (#757/#760)\nUsage: pnpm entities:refresh [--dry-run] [--max-docs=N]',
  );
  const dryRun = process.argv.includes('--dry-run');
  const maxDocsArg = process.argv.find((a) => a.startsWith('--max-docs='))?.split('=')[1];
  refreshHotEntities({ dryRun, maxDocs: maxDocsArg ? parseInt(maxDocsArg, 10) : undefined })
    .then((r) => {
      console.log(`[hot-entities] complete${dryRun ? ' (dry run)' : ''}:`, JSON.stringify(r));
      process.exit(0);
    })
    .catch((err) => {
      console.error('[hot-entities] failed:', err);
      process.exit(1);
    });
}
