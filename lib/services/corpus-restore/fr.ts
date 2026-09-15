/**
 * FR restore (#894): fr_drop_ledger rows recorded at fetch time (signal_url
 * is the signal, not 'historical-annotation' — those rows already have a
 * demoted documents row) that never got a documents row. Re-fetched from the
 * FR API by document number, bodies filled the way the backfill fills them,
 * and stored under the ledger row's own category (FR drops stay with their
 * signal). Calls: one lookup per 20 documents + one raw-text fetch per
 * document without an abstract; ~300 ms between calls.
 */
import { and, count, eq, ne, notExists, sql } from 'drizzle-orm';
import { docNumberFromUrl } from '@/lib/cron/annotate-retrieval-relevance';
import { getDb } from '@/lib/db';
import { documents, frDropLedger } from '@/lib/db/schema';
import {
  fetchFrDocumentsByNumber,
  fetchFrRawText,
  toContentItem,
} from '@/lib/services/federal-register-fetcher';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { applyCap } from './plan';
import type { RestoreBatch, RestoreOptions } from './types';

/** Ledger rows written by the historical annotation pass, not by a fetch. */
const HISTORICAL_ANNOTATION_SIGNAL = 'historical-annotation';
const RAW_TEXT_DELAY_MS = 300;

export interface FrLedgerRow {
  category: string;
  url: string;
}

/** Distinct FR document numbers for a set of ledger rows (unparseable URLs dropped). */
export function resolveDocNumbers(rows: FrLedgerRow[]): {
  numbers: string[];
  unresolvable: number;
} {
  const numbers = new Set<string>();
  let unresolvable = 0;
  for (const row of rows) {
    const num = docNumberFromUrl(row.url);
    if (num) numbers.add(num);
    else unresolvable++;
  }
  return { numbers: [...numbers], unresolvable };
}

/** Group fetched items back onto their ledger rows, one batch per category. */
export function assembleFrBatches(
  rows: FrLedgerRow[],
  matchedByCategory: ReadonlyMap<string, number>,
  itemsByNumber: ReadonlyMap<string, ContentItem>,
  capTripped: boolean,
): RestoreBatch[] {
  const byCategory = new Map<string, RestoreBatch>();
  for (const row of rows) {
    let batch = byCategory.get(row.category);
    if (!batch) {
      batch = {
        matched: matchedByCategory.get(row.category) ?? 0,
        netNew: 0,
        candidates: [],
        category: row.category,
        capTripped,
      };
      byCategory.set(row.category, batch);
    }
    batch.netNew++;
    const num = docNumberFromUrl(row.url);
    const item = num ? itemsByNumber.get(num) : undefined;
    if (item) batch.candidates.push({ ...item });
  }
  return [...byCategory.values()];
}

async function loadMatchedByCategory(): Promise<Map<string, number>> {
  const rows = await getDb()
    .select({ category: frDropLedger.category, n: count() })
    .from(frDropLedger)
    .where(ne(frDropLedger.signalUrl, HISTORICAL_ANNOTATION_SIGNAL))
    .groupBy(frDropLedger.category);
  return new Map(rows.map((r) => [r.category, Number(r.n)]));
}

/** Fetch-time ledger rows with no documents row at (url, category), oldest first. */
async function loadNetNewRows(): Promise<FrLedgerRow[]> {
  const db = getDb();
  const alreadyStored = db
    .select({ one: sql`1` })
    .from(documents)
    .where(and(eq(documents.url, frDropLedger.url), eq(documents.category, frDropLedger.category)));
  return db
    .select({ category: frDropLedger.category, url: frDropLedger.url })
    .from(frDropLedger)
    .where(and(ne(frDropLedger.signalUrl, HISTORICAL_ANNOTATION_SIGNAL), notExists(alreadyStored)))
    .orderBy(frDropLedger.id);
}

/** Fill bodies for items without an abstract, as the backfill does. */
async function fillBodies(items: Iterable<ContentItem>): Promise<void> {
  for (const item of items) {
    if (item.content) continue;
    const rawTextUrl = item.metadata?.raw_text_url;
    if (typeof rawTextUrl !== 'string') continue;
    const text = await fetchFrRawText(rawTextUrl);
    if (text) item.content = text;
    await sleep(RAW_TEXT_DELAY_MS);
  }
}

export async function restoreFr(opts: RestoreOptions): Promise<RestoreBatch[]> {
  const matchedByCategory = await loadMatchedByCategory();
  const netNewRows = await loadNetNewRows();
  const plan = applyCap(netNewRows, opts.maxDocs);
  const { numbers, unresolvable } = resolveDocNumbers(plan.kept);
  console.log(
    `[restore:fr] ${netNewRows.length} ledger rows without a documents row; fetching ${plan.kept.length}` +
      ` (${numbers.length} distinct documents${unresolvable ? `, ${unresolvable} unparseable URLs` : ''})`,
  );

  const docs = await fetchFrDocumentsByNumber(numbers);
  const itemsByNumber = new Map<string, ContentItem>();
  for (const doc of docs) {
    if (doc.document_number) itemsByNumber.set(doc.document_number, toContentItem(doc));
  }
  await fillBodies(itemsByNumber.values());
  const missing = numbers.length - itemsByNumber.size;
  if (missing > 0)
    console.warn(`[restore:fr] ${missing} document number(s) not resolved by the FR API`);

  return assembleFrBatches(plan.kept, matchedByCategory, itemsByNumber, plan.capTripped);
}
