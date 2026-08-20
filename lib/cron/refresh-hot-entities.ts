/**
 * Weekly hot-entity salience index refresh (#757).
 *
 * Sweeps the CURRENT TERM's documents (2025-01-20 → now; the marquee
 * entities are term-cumulative — an 8-week window would miss them), mines
 * entity phrases with the WIDE extractor in memory-safe id-range batches,
 * ranks by term frequency with a recency boost, validates the survivors
 * through the standard alias machinery (match caps feed armWeight), embeds
 * composite phrase texts, and full-replaces the hot_entities table.
 *
 * Usage:
 *   pnpm entities:refresh [--dry-run] [--max-docs N]
 *
 * Also runs as a non-fatal snapshot post-step (tryRefreshHotEntities).
 * Coverage-excluded I/O; pure ranking/merge logic is unit-tested in
 * lib/services/hot-entity-ranking.ts.
 */

import { and, isNotNull, sql } from 'drizzle-orm';
import {
  buildActiveSourceCondition,
  buildAnalysisPeriodCondition,
  T2_INAUGURATION,
} from '@/lib/data/analysis-periods';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents, hotEntities, hotEntityDocs } from '@/lib/db/schema';
import { dataWeekStamp } from '@/lib/services/arm-cache';
import { extractEntityPhrases, WIDE_EXTRACTION } from '@/lib/services/entity-extraction';
import type { HotEntityEntry } from '@/lib/services/hot-entity-ranking';
import {
  applyBaselineFrequencies,
  topCategories,
  MAX_HOT_ENTITIES,
  mergeDocExtraction,
  rankHotEntities,
  RECENT_WINDOW_WEEKS,
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
  written: number;
  junctionRows: number;
}

function baseScope() {
  return and(
    buildActiveSourceCondition(documents.sourceOrigin),
    isNotNull(documents.content),
    sql`${documents.retrievalRelevant} IS NOT FALSE`,
    sql`${documents.contentType} != 'metadata_only'`,
  );
}

/** Batched id-range sweep over `scope`, calling `onDoc` per document with
 *  its extracted phrases — texts are never accumulated (memory-safe). */
async function sweepCorpus(
  scope: ReturnType<typeof and>,
  label: string,
  onDoc: (
    row: { id: number; title: string; publishedAt: string | null; category: string | null },
    phrases: ReturnType<typeof extractEntityPhrases>,
  ) => void,
  maxDocs?: number,
): Promise<number> {
  // nosemgrep: opengrep.cron-needs-env-config
  const db = getDb();
  const bounds = await db
    .select({ lo: sql<number>`min(${documents.id})`, hi: sql<number>`max(${documents.id})` })
    .from(documents)
    .where(scope);
  const { lo, hi } = bounds[0] ?? { lo: null, hi: null };
  if (lo == null || hi == null) return 0;

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
      onDoc(row, phrases);
      scanned++;
      if (maxDocs && scanned >= maxDocs) return scanned;
    }
    batches++;
    if (batches % 25 === 0) {
      console.log(`[hot-entities] ${label}: scanned ${scanned} docs`);
    }
  }
  return scanned;
}

/** Term sweep (2025-01-20→now) into the entry accumulator. */
async function sweepTerm(acc: Map<string, HotEntityEntry>, maxDocs?: number): Promise<number> {
  const recentCutoff = new Date(Date.now() - RECENT_WINDOW_WEEKS * 7 * 86400_000).toISOString();
  const scope = and(baseScope(), sql`${documents.publishedAt} >= ${T2_INAUGURATION}::timestamptz`);
  return sweepCorpus(
    scope,
    'term',
    (row, phrases) => {
      mergeDocExtraction(acc, row, phrases, recentCutoff);
    },
    maxDocs,
  );
}

/** Baseline sweep (analysis periods before the term) into a frequency map —
 *  the novelty denominator that collapses era-invariant legal boilerplate. */
async function sweepBaselines(maxDocs?: number): Promise<Map<string, number>> {
  const freq = new Map<string, number>();
  const scope = and(
    baseScope(),
    buildAnalysisPeriodCondition(documents.publishedAt),
    sql`${documents.publishedAt} < ${T2_INAUGURATION}::timestamptz`,
  );
  await sweepCorpus(
    scope,
    'baseline',
    (_row, phrases) => {
      for (const p of phrases) {
        const key = p.phrase.toLowerCase();
        freq.set(key, (freq.get(key) ?? 0) + 1);
      }
    },
    maxDocs,
  );
  return freq;
}

/** Validate ranked entities in chunks; keeps phrase→ftsMatches for armWeight. */
async function validateRanked(ranked: HotEntityEntry[]): Promise<Map<string, number>> {
  const matches = new Map<string, number>();
  for (let i = 0; i < ranked.length; i += VALIDATION_CHUNK) {
    const chunk = ranked.slice(i, i + VALIDATION_CHUNK);
    const { validated } = await validateAliasesDiagnostic(
      chunk.map((e) => e.phrase),
      {},
    );
    for (const v of validated as ValidatedAlias[]) matches.set(v.phrase.toLowerCase(), v.matches);
    if ((i / VALIDATION_CHUNK) % 5 === 0) {
      console.log(
        `[hot-entities] validated ${Math.min(i + VALIDATION_CHUNK, ranked.length)}/${ranked.length}`,
      );
    }
  }
  return matches;
}

export async function refreshHotEntities(opts: RefreshOptions): Promise<RefreshResult> {
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  const t0 = Date.now();
  const acc = new Map<string, HotEntityEntry>();
  const docsScanned = await sweepTerm(acc, opts.maxDocs);
  const baselineFreq = await sweepBaselines(opts.maxDocs);
  applyBaselineFrequencies(acc, baselineFreq);
  const ranked = rankHotEntities(acc, WIDE_EXTRACTION.minDocFrequency);
  console.log(
    `[hot-entities] term=${docsScanned} docs, phrases=${acc.size}, baselinePhrases=${baselineFreq.size}, ranked=${ranked.length} (${Math.round((Date.now() - t0) / 1000)}s)`,
  );
  if (opts.dryRun) {
    console.log('[hot-entities] dry run — top 25:');
    for (const e of ranked.slice(0, 25)) {
      console.log(
        `   ${e.phrase} [${e.entityClass}] term=${e.docFreqTerm} recent=${e.docFreqRecent} baseline=${e.docFreqBaseline}`,
      );
    }
    return {
      docsScanned,
      phrasesExtracted: acc.size,
      ranked: ranked.length,
      validated: 0,
      written: 0,
      junctionRows: 0,
    };
  }

  const ftsByPhrase = await validateRanked(ranked);
  const validated = ranked
    .filter((e) => ftsByPhrase.has(e.phrase.toLowerCase()))
    .slice(0, MAX_HOT_ENTITIES);

  // nosemgrep: opengrep.cron-needs-env-config
  const db = getDb();
  const weekStamp = dataWeekStamp();
  let junctionRows = 0;
  await db.transaction(async (tx) => {
    await tx.delete(hotEntities);
    for (let i = 0; i < validated.length; i += 200) {
      const chunk = validated.slice(i, i + 200);
      const inserted = await tx
        .insert(hotEntities)
        .values(
          chunk.map((e) => ({
            phrase: e.phrase,
            entityClass: e.entityClass,
            docFreqTerm: e.docFreqTerm,
            docFreqBaseline: e.docFreqBaseline,
            ftsMatches: ftsByPhrase.get(e.phrase.toLowerCase()) ?? 0,
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
      junctionRows += junction.length;
    }
  });
  console.log(
    `[hot-entities] wrote ${validated.length} entities + ${junctionRows} mention rows for week ${weekStamp} in ${Math.round((Date.now() - t0) / 1000)}s`,
  );
  return {
    docsScanned,
    phrasesExtracted: acc.size,
    ranked: ranked.length,
    validated: validated.length,
    written: validated.length,
    junctionRows,
  };
}

// CLI entry
if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  checkHelp(
    process.argv,
    'Refresh the hot-entity salience index (#757)\nUsage: pnpm entities:refresh [--dry-run] [--max-docs=N]',
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
