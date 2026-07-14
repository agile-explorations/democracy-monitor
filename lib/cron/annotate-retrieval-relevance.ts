/**
 * Historical retrieval-relevance annotation for mediaFreedom FR docs (#544).
 *
 * Classifies every stored mediaFreedom federal_register document with the
 * SAME filter + pattern version used at fetch time (#541), then:
 *   - kept:   documents.retrieval_relevant = true
 *   - dropped: documents.retrieval_relevant = false
 *              + fr_drop_ledger row (signal_url 'historical-annotation')
 *              + cascade-delete of derived rows by (url, category):
 *                document_scores, ai_document_assessments, and
 *                p2025_matches (by document_id — populated for this table)
 *   - final aggregate-repair phase: upserts computeWeeklyAggregate for EVERY
 *     mediaFreedom week in range, so weeks that lost all scored docs don't
 *     keep stale counts (computeAllWeeklyAggregates only iterates weeks still
 *     present in document_scores).
 *
 * The filter matches title+abstract; stored content is unusable (FR header
 * boilerplate / full text), so abstracts are fetched from the FR API in
 * document-number batches. Docs the API can't resolve fall back to
 * title-only matching (exclusions are title-only by design; recall risk is
 * documents whose only allow-signal lives in the abstract — reported).
 *
 * Idempotent + resumable: only rows with retrieval_relevant IS NULL are
 * processed; re-runs after interruption or as a post-deploy sweep are safe.
 *
 * Usage:
 *   pnpm mf:annotate --dry-run          # classify + report, no writes
 *   pnpm mf:annotate                    # full annotation + cascade + repair
 *   pnpm mf:annotate --limit 500        # bounded run (still resumable)
 *   pnpm mf:annotate --skip-repair      # skip the aggregate-repair phase
 */
import { and, eq, isNull, sql, inArray } from 'drizzle-orm';
import { PATTERN_VERSION } from '@/lib/data/retrieval-relevance-patterns';
import { getDb, isDbAvailable } from '@/lib/db';
import {
  documents,
  documentScores,
  aiDocumentAssessments,
  frDropLedger,
  p2025Matches,
} from '@/lib/db/schema';
import { assessRetrievalRelevance } from '@/lib/services/retrieval-relevance-filter';
import { checkHelp } from '@/lib/utils/cli-help';
import { chunk } from '@/lib/utils/collections';
import { addDays, getMonday, toDateString } from '@/lib/utils/date-utils';

const CATEGORY = 'mediaFreedom';
const FR_API = 'https://www.federalregister.gov/api/v1/documents';
const FR_BATCH_SIZE = 20;
const FR_DELAY_MS = 300;
/** Earliest analysis period start (trump_2017). */
const REPAIR_FROM = '2017-01-20';

interface Args {
  dryRun: boolean;
  limit?: number;
  skipRepair: boolean;
}

interface CandidateDoc {
  id: number;
  url: string;
  title: string;
}

function parseArgs(): Args {
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm mf:annotate [--dry-run] [--limit N] [--skip-repair]

Annotates mediaFreedom FR docs with retrieval relevance (#544).
--dry-run      classify and report only, no writes
--limit N      process at most N unannotated docs (resumable)
--skip-repair  skip the weekly-aggregate repair phase`,
  );
  const args: Args = { dryRun: false, skipRepair: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--dry-run') args.dryRun = true;
    else if (argv[i] === '--limit') args.limit = parseInt(argv[++i], 10);
    else if (argv[i] === '--skip-repair') args.skipRepair = true;
  }
  return args;
}

/** FR document number from a federalregister.gov document URL, or null. */
export function docNumberFromUrl(url: string): string | null {
  const m = url.match(/\/documents\/\d{4}\/\d{2}\/\d{2}\/([^/?#]+)\//);
  return m ? m[1] : null;
}

/** Fetch abstracts for a batch of FR document numbers. Missing/failed → absent. */
async function fetchAbstracts(docNumbers: string[]): Promise<Map<string, string | null>> {
  const result = new Map<string, string | null>();
  if (docNumbers.length === 0) return result;
  const url =
    `${FR_API}/${docNumbers.map(encodeURIComponent).join(',')}.json` +
    `?fields[]=document_number&fields[]=abstract`;
  try {
    const res = await fetch(url);
    if (!res.ok) return result;
    const json = (await res.json()) as {
      results?: Array<{ document_number?: string; abstract?: string | null }>;
      document_number?: string;
      abstract?: string | null;
    };
    // Multi-doc responses use {results: [...]}; a single-doc request returns the doc object.
    const docs = json.results ?? (json.document_number ? [json] : []);
    for (const d of docs) {
      if (d.document_number) result.set(d.document_number, d.abstract ?? null);
    }
  } catch (err) {
    console.warn(`[mf:annotate] FR API batch failed (${docNumbers.length} docs):`, err);
  }
  return result;
}

interface Classified {
  doc: CandidateDoc;
  relevant: boolean;
  reason: string;
  abstractFetched: boolean;
}

async function classifyBatch(batch: CandidateDoc[]): Promise<Classified[]> {
  const numbered = batch
    .map((doc) => ({ doc, num: docNumberFromUrl(doc.url) }))
    .filter((x): x is { doc: CandidateDoc; num: string } => x.num !== null);
  const abstracts = await fetchAbstracts(numbered.map((x) => x.num));

  return batch.map((doc) => {
    const num = docNumberFromUrl(doc.url);
    const abstract = num ? (abstracts.get(num) ?? null) : null;
    const verdict = assessRetrievalRelevance(CATEGORY, { title: doc.title, abstract });
    return {
      doc,
      relevant: verdict.relevant,
      reason: verdict.reason,
      abstractFetched: abstract !== null,
    };
  });
}

/** Annotate + cascade one classified batch inside a transaction. */
async function writeBatch(classified: Classified[]): Promise<void> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block
  const db = getDb();
  const kept = classified.filter((c) => c.relevant);
  const dropped = classified.filter((c) => !c.relevant);

  await db.transaction(async (tx) => {
    if (kept.length > 0) {
      await tx
        .update(documents)
        .set({ retrievalRelevant: true })
        .where(
          inArray(
            documents.id,
            kept.map((c) => c.doc.id),
          ),
        );
    }
    for (const { doc, reason } of dropped) {
      await tx.update(documents).set({ retrievalRelevant: false }).where(eq(documents.id, doc.id));
      await tx
        .insert(frDropLedger)
        .values({
          category: CATEGORY,
          signalUrl: 'historical-annotation',
          url: doc.url,
          title: doc.title,
          agency: null,
          publishedAt: null,
          reason,
          patternVersion: PATTERN_VERSION,
        })
        .onConflictDoNothing();
      // Derived rows key on (url, category) — document_id is NULL on
      // assessments (known schema issue); p2025_matches keys on document_id.
      await tx
        .delete(documentScores)
        .where(and(eq(documentScores.url, doc.url), eq(documentScores.category, CATEGORY)));
      await tx
        .delete(aiDocumentAssessments)
        .where(
          and(eq(aiDocumentAssessments.url, doc.url), eq(aiDocumentAssessments.category, CATEGORY)),
        );
      await tx.delete(p2025Matches).where(eq(p2025Matches.documentId, doc.id));
    }
  });
}

/** Upsert fresh aggregates for every mediaFreedom week in range (stale-week repair). */
async function repairAggregates(dryRun: boolean): Promise<number> {
  const { computeWeeklyAggregate, storeWeeklyAggregate } =
    await import('@/lib/services/weekly-aggregator');
  const today = toDateString(new Date());
  let week = getMonday(new Date(REPAIR_FROM));
  let count = 0;
  while (week <= today) {
    if (!dryRun) {
      const agg = await computeWeeklyAggregate(CATEGORY, week);
      await storeWeeklyAggregate(agg);
    }
    count++;
    week = addDays(week, 7);
  }
  return count;
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block
  const db = getDb();

  const candidates: CandidateDoc[] = await db
    .select({ id: documents.id, url: documents.url, title: documents.title })
    .from(documents)
    .where(
      and(
        eq(documents.category, CATEGORY),
        eq(documents.sourceOrigin, 'federal_register'),
        isNull(documents.retrievalRelevant),
        sql`${documents.url} IS NOT NULL`,
      ),
    )
    .orderBy(documents.id)
    .limit(args.limit ?? 1_000_000)
    .then((rows) => rows.filter((r): r is CandidateDoc => r.url !== null));

  console.log(
    `[mf:annotate] ${candidates.length} unannotated ${CATEGORY} FR docs` +
      `${args.dryRun ? ' (DRY RUN)' : ''} — pattern v${PATTERN_VERSION}`,
  );

  let kept = 0;
  let dropped = 0;
  let titleOnly = 0;
  const reasons: Record<string, number> = {};
  const keptTitles: string[] = [];

  for (const batch of chunk(candidates, FR_BATCH_SIZE)) {
    const classified = await classifyBatch(batch);
    for (const c of classified) {
      if (c.relevant) {
        kept++;
        if (keptTitles.length < 50) keptTitles.push(c.doc.title);
      } else dropped++;
      if (!c.abstractFetched) titleOnly++;
      reasons[c.reason] = (reasons[c.reason] ?? 0) + 1;
    }
    if (!args.dryRun) await writeBatch(classified);
    if ((kept + dropped) % 1000 < FR_BATCH_SIZE) {
      console.log(`[mf:annotate] ${kept + dropped}/${candidates.length} classified...`);
    }
    await new Promise((r) => setTimeout(r, FR_DELAY_MS));
  }

  console.log(`[mf:annotate] Done: ${kept} kept, ${dropped} dropped, ${titleOnly} title-only`);
  console.log(`[mf:annotate] Reasons:`, JSON.stringify(reasons));
  console.log(`[mf:annotate] Kept titles (≤50):`);
  for (const t of keptTitles) console.log(`  - ${t}`);

  if (!args.skipRepair) {
    const weeks = await repairAggregates(args.dryRun);
    console.log(
      `[mf:annotate] Aggregate repair: ${weeks} ${CATEGORY} weeks ${args.dryRun ? 'would be' : ''} recomputed`,
    );
  }
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[mf:annotate] Fatal:', err);
      process.exit(1);
    });
}
