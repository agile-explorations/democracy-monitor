/**
 * Corpus restore CLI (#894, R-SEARCH-ORTHOGONAL): re-fetches documents the
 * ingest pipeline saw but dropped — FR fetch-time drops, zero-category
 * hearings/opinions/CREC granules, unrouted CPD packages, DOJ leadership-
 * office releases — and stores them as search-only rows via
 * storeExcludedDocuments (retrieval_relevant=false; counting_scope=false
 * under 'corpus'). Dry-run by default: prints the three precheck numbers
 * (source-matched, net-new after the anti-join, embeddable) and writes only
 * under --confirm. --max-docs caps the fetch; a tripped cap exits 3.
 *
 * Usage: pnpm corpus:restore --source fr|chrg|cl|cpd|doj|crec [--dry-run | --confirm]
 *          [--max-docs N] [--from YYYY-MM-DD --to YYYY-MM-DD]
 */
import { isDbAvailable } from '@/lib/db';
import { CORPUS_CATEGORY } from '@/lib/db/document-filters';
import { RESTORE_REGISTRY } from '@/lib/services/corpus-restore';
import {
  parseRestoreArgs,
  RANGED_SOURCES,
  RESTORE_USAGE,
} from '@/lib/services/corpus-restore/cli-args';
import type { RestoreArgs } from '@/lib/services/corpus-restore/cli-args';
import { antiJoinByUrl, precheckOf } from '@/lib/services/corpus-restore/plan';
import { findStoredUrls } from '@/lib/services/corpus-restore/stored-urls';
import type { RestoreBatch } from '@/lib/services/corpus-restore/types';
import { storeExcludedDocuments } from '@/lib/services/document-store';
import { checkHelp } from '@/lib/utils/cli-help';

/** Exit code when --max-docs tripped: more work remains, a human re-runs. */
const EXIT_CAP_TRIPPED = 3;

interface BatchOutcome {
  stored: number;
  skipped: number;
}

/** Final guard: the (url, category) anti-join right before the write —
 *  any category for the corpus pseudo-category, the row's own otherwise. */
async function finalAntiJoin(batch: RestoreBatch) {
  const urls = batch.candidates.map((c) => c.link).filter((l): l is string => !!l);
  const scope = batch.category === CORPUS_CATEGORY ? undefined : batch.category;
  return antiJoinByUrl(batch.candidates, await findStoredUrls(urls, scope));
}

async function processBatch(
  batch: RestoreBatch,
  args: RestoreArgs,
  tag: string,
): Promise<BatchOutcome> {
  const fresh = await finalAntiJoin(batch);
  const precheck = precheckOf(batch, fresh);
  const capNote = args.maxDocs !== undefined ? ` (cap ${args.maxDocs})` : '';
  console.log(`${tag} precheck — category '${batch.category}':`);
  console.log(`  source-matched: ${precheck.matched}`);
  console.log(
    `  net-new:        ${precheck.netNew}  (after anti-join against documents, before cap)`,
  );
  console.log(`  fetched:        ${precheck.fetched}${capNote}`);
  console.log(`  embeddable:     ${precheck.embeddable}  (non-empty content)`);

  if (!args.confirm) {
    console.log(`${tag} DRY RUN — nothing written (pass --confirm to store)`);
    return { stored: 0, skipped: fresh.length };
  }
  // A row without a body would be searchable-but-empty and, anti-joined by
  // URL, never retried: store only what the precheck counted as embeddable.
  const withBody = fresh.filter((c) => (c.content ?? '').trim().length > 0);
  if (withBody.length < fresh.length) {
    console.warn(
      `${tag} ${fresh.length - withBody.length} candidate(s) had no text — left for a later run`,
    );
  }
  const stored = await storeExcludedDocuments(withBody, batch.category);
  const outcome = { stored, skipped: fresh.length - stored };
  console.log(
    `${tag} stored ${outcome.stored}, skipped ${outcome.skipped} (already present, unstorable, or no text)`,
  );
  return outcome;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  checkHelp(argv, RESTORE_USAGE);
  const args = parseRestoreArgs(argv);
  if (!isDbAvailable()) throw new Error('DATABASE_URL not configured');

  const tag = `[corpus:restore ${args.source}]`;
  const rangeNote = RANGED_SOURCES.has(args.source)
    ? `${args.from}..${args.to}`
    : 'ledger source — date range ignored';
  console.log(
    `${tag} ${args.confirm ? 'CONFIRM' : 'DRY RUN'}; ${rangeNote}; max-docs ${args.maxDocs ?? 'unbounded'}`,
  );

  const batches = await RESTORE_REGISTRY[args.source]({
    from: args.from,
    to: args.to,
    maxDocs: args.maxDocs,
  });
  const totals: BatchOutcome = { stored: 0, skipped: 0 };
  for (const batch of batches) {
    const outcome = await processBatch(batch, args, tag);
    totals.stored += outcome.stored;
    totals.skipped += outcome.skipped;
  }
  console.log(
    `${tag} done: ${batches.length} batch(es), stored ${totals.stored}, skipped ${totals.skipped}`,
  );

  if (batches.some((b) => b.capTripped)) {
    console.error(
      `${tag} --max-docs ${args.maxDocs} tripped: more net-new documents remain. Re-run to continue.`,
    );
    return EXIT_CAP_TRIPPED;
  }
  return 0;
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[corpus:restore] Fatal:', err);
      process.exit(1);
    });
}
