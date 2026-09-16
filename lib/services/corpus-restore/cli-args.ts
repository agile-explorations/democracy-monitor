/**
 * Argument parsing for `pnpm corpus:restore` (#894). Pure so the defaults
 * (dry-run unless --confirm, per-source --from) are unit-tested.
 */
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { CORPUS_CATEGORY } from '@/lib/data/document-populations';
import { toDateString } from '@/lib/utils/date-utils';
import { isRestoreSource, RESTORE_SOURCES } from './types';
import type { RestoreSource } from './types';

/** Earliest analysis period start (trump_2017) — the feed walks' default floor. */
const EARLIEST_ANALYSIS_DATE = '2017-01-20';

/** Sources whose restore walks a date range (the ledger sources ignore it). */
export const RANGED_SOURCES: ReadonlySet<RestoreSource> = new Set(['cpd', 'doj', 'crec']);

export const DEFAULT_FROM: Readonly<Partial<Record<RestoreSource, string>>> = {
  cpd: EARLIEST_ANALYSIS_DATE,
  doj: EARLIEST_ANALYSIS_DATE,
  crec: T2_INAUGURATION,
};

export interface RestoreArgs {
  source: RestoreSource;
  /** Writes happen only when true (--confirm); --dry-run is the default. */
  confirm: boolean;
  maxDocs?: number;
  from: string;
  to: string;
  baselines: boolean;
}

export const RESTORE_USAGE = `Usage: pnpm corpus:restore --source ${RESTORE_SOURCES.join('|')} [--dry-run | --confirm] [--max-docs N] [--from YYYY-MM-DD --to YYYY-MM-DD]

Restores documents the ingest pipeline saw but dropped as search-only rows
(retrieval_relevant=false; counting_scope=false under ${CORPUS_CATEGORY}) (#894).

--source S     fr (fr_drop_ledger, stays under the signal category) |
               chrg (chrg_seen_ledger zero_categories) | cl (cl_cluster_ledger
               zero_categories) | cpd (unrouted packages) | doj (corpus
               components) | crec (unrouted granules) — the last three under ${CORPUS_CATEGORY}
--dry-run      precheck only, no writes (default)
--confirm      store via storeExcludedDocuments (insert-only, never demotes)
--max-docs N   fetch at most N documents; exits 3 when the cap trips
--from/--to    date range for cpd/doj/crec (defaults: cpd/doj 2017-01-20,
               crec 2025-01-20; to = today); ledger sources ignore the range
--baselines    required acknowledgment when --from predates 2025-01-20 (one owner
               approval per run; corpus-only rows never enter baselines)`;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseDate(flag: string, value: string | undefined): string {
  if (!value || !DATE_RE.test(value)) throw new Error(`${flag} expects YYYY-MM-DD, got '${value}'`);
  return value;
}

function parsePositiveInt(flag: string, value: string | undefined): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new Error(`${flag} expects a positive integer`);
  return n;
}

export function parseRestoreArgs(argv: string[], today = toDateString(new Date())): RestoreArgs {
  let source: string | undefined;
  let dryRun = false;
  let confirm = false;
  let maxDocs: number | undefined;
  let from: string | undefined;
  let to: string | undefined;
  let baselines = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--source') source = argv[++i];
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--confirm') confirm = true;
    else if (arg === '--max-docs') maxDocs = parsePositiveInt(arg, argv[++i]);
    else if (arg === '--from') from = parseDate(arg, argv[++i]);
    else if (arg === '--to') to = parseDate(arg, argv[++i]);
    else if (arg === '--baselines') baselines = true;
    else throw new Error(`Unknown argument '${arg}'`);
  }

  if (!source || !isRestoreSource(source)) {
    throw new Error(`--source is required: one of ${RESTORE_SOURCES.join(', ')}`);
  }
  if (dryRun && confirm) throw new Error('--dry-run and --confirm are mutually exclusive');

  const resolvedFrom = from ?? DEFAULT_FROM[source] ?? EARLIEST_ANALYSIS_DATE;
  const resolvedTo = to ?? today;
  if (resolvedFrom > resolvedTo)
    throw new Error(`--from ${resolvedFrom} is after --to ${resolvedTo}`);

  if (RANGED_SOURCES.has(source) && resolvedFrom < T2_INAUGURATION && confirm && !baselines) {
    throw new Error(
      `--from ${resolvedFrom} predates ${T2_INAUGURATION}: baseline-period writes need explicit approval — pass --baselines to acknowledge`,
    );
  }
  return { source, confirm, maxDocs, from: resolvedFrom, to: resolvedTo, baselines };
}
