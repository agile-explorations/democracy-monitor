/**
 * CLI: pnpm backfill:opinions [--category KEY] [--dry-run] [--limit N]
 *
 * Backfills judicial opinion documents from CourtListener for existing docket entries.
 * For each unique docket, fetches the most recent opinion and stores it as a new
 * document (type: judicial_opinion) linked to the parent docket via case_id.
 *
 * Fully resumable: skips dockets that already have opinion documents stored.
 */

import { eq, sql, and, gte, lte } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { fetchOpinionTextFromDb, isBulkOpinionDbAvailable } from '@/lib/services/cl-bulk-staging';
import {
  extractDocketId,
  fetchOpinionText,
  buildOpinionContentItem,
  RATE_LIMIT_DELAY_MS,
} from '@/lib/services/courtlistener-fetcher';
import { storeDocuments } from '@/lib/services/document-store';
import { sleep } from '@/lib/utils/async';
import { checkHelp } from '@/lib/utils/cli-help';
import { getWeekRanges } from '@/lib/utils/date-utils';

interface BackfillOptions {
  category?: string;
  from?: string;
  to?: string;
  dryRun: boolean;
  limit: number | null;
}

interface DocketInfo {
  url: string;
  caseId: string;
  caseName: string;
  court: string;
  suitNature: string | null;
  filedDate: string | null;
  categories: string[];
}

/** Query distinct CL docket entries grouped by case_id, with their categories. */
async function getDocketEntries(options: BackfillOptions): Promise<DocketInfo[]> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();

  const conditions = [eq(documents.sourceOrigin, 'courtlistener' as string)];
  if (options.category) conditions.push(eq(documents.category, options.category));
  if (options.from) conditions.push(gte(documents.publishedAt, new Date(options.from)));
  if (options.to) conditions.push(lte(documents.publishedAt, new Date(options.to)));

  const rows = await db
    .select({
      url: documents.url,
      caseId: documents.caseId,
      title: documents.title,
      category: documents.category,
      metadata: documents.metadata,
      publishedAt: documents.publishedAt,
    })
    .from(documents)
    .where(and(...conditions))
    .orderBy(documents.caseId);

  // Group by case_id, collecting all categories per docket
  const docketMap = new Map<string, DocketInfo>();
  for (const row of rows) {
    if (!row.url || !row.caseId) continue;
    const existing = docketMap.get(row.caseId);
    if (existing) {
      if (!existing.categories.includes(row.category)) {
        existing.categories.push(row.category);
      }
    } else {
      const meta = row.metadata as Record<string, unknown> | null;
      docketMap.set(row.caseId, {
        url: row.url,
        caseId: row.caseId,
        caseName: row.title,
        court: (meta?.agency as string) ?? 'Federal Court',
        suitNature: (meta?.suitNature as string) ?? null,
        filedDate: row.publishedAt?.toISOString().slice(0, 10) ?? null,
        categories: [row.category],
      });
    }
  }

  return [...docketMap.values()];
}

/** Check if an opinion document already exists for a given case_id. */
async function opinionExists(caseId: string): Promise<boolean> {
  // nosemgrep: opengrep.cron-needs-env-config — loadEnvConfig called in CLI entry block below
  const db = getDb();
  const [row] = await db
    .select({ id: sql<number>`1` })
    .from(documents)
    .where(and(eq(documents.caseId, caseId), eq(documents.sourceType, 'judicial_opinion')))
    .limit(1);
  return !!row;
}

/**
 * Opinion-first approach for a date range: find opinions by issue date (via the
 * bulk-staging dispatcher, which uses the CL API when staging is absent). Chunked
 * by week for resumability and to stay under the per-query page cap. Returns true
 * when a date range was given (opinion-first is the intended path for ranges),
 * so the caller skips the docket-first fallback.
 */
async function tryOpinionFirst(options: BackfillOptions): Promise<boolean> {
  if (!options.from || !options.to) return false;
  const { opinionFirstPass } = await import('@/lib/services/cl-opinion-first-fetcher');

  const weeks = getWeekRanges(options.from, options.to);
  let totalOpinions = 0;
  let totalDocs = 0;
  for (const week of weeks) {
    const r = await opinionFirstPass(week.start, week.end, options.dryRun);
    totalOpinions += r.docketsFound;
    totalDocs += r.opinionsStored;
    console.log(
      `[backfill-opinions] week ${week.start}→${week.end}: ` +
        `${r.docketsFound} opinions, ${r.opinionsStored} docs`,
    );
  }
  console.log(
    `[backfill-opinions] Opinion-first total (${weeks.length} weeks): ` +
      `${totalOpinions} opinions, ${totalDocs} docs`,
  );
  return true;
}

async function run(options: BackfillOptions): Promise<void> {
  if (!isDbAvailable()) {
    console.error('[backfill-opinions] DATABASE_URL not configured');
    process.exit(1);
  }

  if (await tryOpinionFirst(options)) return;
  console.log('[backfill-opinions] Querying docket entries...');
  const dockets = await getDocketEntries(options);
  console.log(`[backfill-opinions] Found ${dockets.length} unique dockets`);

  if (options.dryRun) {
    console.log('[backfill-opinions] Dry run — no API calls or writes');
    return;
  }

  const useBulkDb = await isBulkOpinionDbAvailable();
  if (useBulkDb) {
    console.log('[backfill-opinions] Using local bulk DB for opinion text (no rate limit)');
  }

  const toProcess = options.limit ? dockets.slice(0, options.limit) : dockets;
  let processed = 0;
  let opinionsFound = 0;
  let documentsCreated = 0;
  let skipped = 0;

  for (const docket of toProcess) {
    processed++;

    // Resumability: skip if opinion already stored
    const exists = await opinionExists(docket.caseId);
    if (exists) {
      skipped++;
      if (processed % 500 === 0) {
        console.log(
          `[backfill-opinions] ${processed}/${toProcess.length} processed ` +
            `(${opinionsFound} opinions, ${skipped} skipped)`,
        );
      }
      continue;
    }

    // Extract docket ID from case_id (format: cl:12345)
    const docketId = parseInt(docket.caseId.replace('cl:', ''), 10);
    if (isNaN(docketId)) {
      if (processed % 500 === 0) {
        console.log(
          `[backfill-opinions] ${processed}/${toProcess.length} processed ` +
            `(${opinionsFound} opinions, ${skipped} skipped)`,
        );
      }
      continue;
    }

    const opinion = useBulkDb
      ? await fetchOpinionTextFromDb(docketId)
      : await fetchOpinionText(docketId);
    if (!useBulkDb) await sleep(RATE_LIMIT_DELAY_MS);

    if (opinion) {
      // Sanity check: skip opinions that predate the docket filing (CL data mislinkage)
      if (docket.filedDate && opinion.dateFiled < docket.filedDate) {
        continue;
      }
      opinionsFound++;
      const item = buildOpinionContentItem(opinion, {
        caseName: docket.caseName,
        court: docket.court,
        docketId,
        suitNature: docket.suitNature ?? undefined,
      });

      // Store in each category the parent docket belongs to
      for (const cat of docket.categories) {
        await storeDocuments([item], cat);
        documentsCreated++;
      }
    }

    if (processed % 100 === 0) {
      const hitRate =
        processed > 0 ? ((opinionsFound / (processed - skipped)) * 100).toFixed(1) : '0';
      console.log(
        `[backfill-opinions] ${processed}/${toProcess.length} processed ` +
          `(${opinionsFound} opinions, ${documentsCreated} docs created, ` +
          `${skipped} skipped, ${hitRate}% hit rate)`,
      );
    }
  }

  printSummary(processed, skipped, opinionsFound, documentsCreated);
}

function printSummary(
  processed: number,
  skipped: number,
  opinionsFound: number,
  documentsCreated: number,
): void {
  const totalApiCalls = processed - skipped;
  const hitRate = totalApiCalls > 0 ? ((opinionsFound / totalApiCalls) * 100).toFixed(1) : '0';

  console.log('\n[backfill-opinions] === Summary ===');
  console.log(`  Dockets processed:   ${processed}`);
  console.log(`  Skipped (existing):  ${skipped}`);
  console.log(`  API calls made:      ${totalApiCalls}`);
  console.log(`  Opinions found:      ${opinionsFound}`);
  console.log(`  Documents created:   ${documentsCreated}`);
  console.log(`  Hit rate:            ${hitRate}%`);

  if (documentsCreated > 0) {
    console.log(
      '\n[backfill-opinions] Run `pnpm embeddings:backfill` to embed new opinion documents.',
    );
  }
}

function parseCliArgs(args: string[]): BackfillOptions {
  const opts: BackfillOptions = { dryRun: false, limit: null };
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--category') opts.category = args[++i];
    else if (arg === '--from') opts.from = args[++i];
    else if (arg === '--to') opts.to = args[++i];
    else if (arg === '--limit') {
      const n = parseInt(args[++i], 10);
      if (!isNaN(n)) opts.limit = n;
    } else if (arg === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  const argv = process.argv.slice(2);
  checkHelp(
    argv,
    `Usage: pnpm backfill:opinions [options]

Options:
  --from <date>       Start date (YYYY-MM-DD)
  --to <date>         End date (YYYY-MM-DD)
  --category <key>    Process a single category
  --limit <n>         Max documents to process
  --dry-run           Preview without writing to DB`,
  );
  const options = parseCliArgs(argv);
  run(options).catch((err) => {
    console.error('[backfill-opinions] Fatal:', err);
    process.exit(1);
  });
}
