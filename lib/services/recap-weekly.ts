/**
 * Weekly RECAP document ingest for enrolled dockets (#740) — snapshot
 * post-step companion to the backfill CLI. For every enrolled docket (seed
 * config + discovery-enrolled tracked_cases rows), fetch docket entries
 * newer than the last ingested document and store new court-authored text.
 * Hard-capped per run; expected steady-state volume ~5–20 docs/week.
 *
 * I/O module — excluded from unit coverage; filtering is unit-tested in
 * recap-filter.test.ts.
 */

import { sql } from 'drizzle-orm';
import { CURATED_DOCKETS, DEFAULT_DOCKET_CATEGORIES } from '@/lib/data/curated-dockets';
import { getDb, isDbAvailable } from '@/lib/db';
import { enrolledDocketIds, RECAP_INGEST_PROVENANCE } from '@/lib/services/docket-discovery';
import { storeDocuments } from '@/lib/services/document-store';
import {
  buildRecapContentItem,
  fetchRecapText,
  listDocketCandidates,
} from '@/lib/services/recap-fetcher';
import { sleep } from '@/lib/utils/async';

/** Text fetches per weekly run — bounds a burst week. */
export const WEEKLY_INGEST_CAP = 60;
const TEXT_FETCH_DELAY_MS = 1000;

interface EnrolledCase {
  docketId: number;
  label: string;
  categories: string[];
}

/** Seed cases + discovery-enrolled rows, with labels and routing. */
async function enrolledCases(): Promise<EnrolledCase[]> {
  const cases: EnrolledCase[] = CURATED_DOCKETS.flatMap((c) =>
    c.docketIds.map((docketId) => ({ docketId, label: c.label, categories: c.categories })),
  );
  const seeded = new Set(cases.map((c) => c.docketId));
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT docket_id, case_name, categories FROM tracked_cases
    WHERE provenance @> ${JSON.stringify([RECAP_INGEST_PROVENANCE])}::jsonb`);
  for (const r of rows.rows as Array<{
    docket_id: string | number;
    case_name: string;
    categories: string[] | null;
  }>) {
    const docketId = Number(r.docket_id);
    if (seeded.has(docketId)) continue;
    cases.push({
      docketId,
      label: r.case_name,
      categories: r.categories?.length ? r.categories : DEFAULT_DOCKET_CATEGORIES,
    });
  }
  return cases;
}

/** Latest ingested RECAP doc date per docket (dedup floor for the sweep). */
async function lastIngestedDate(docketId: number): Promise<string | null> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT max(published_at)::text AS latest FROM documents
    WHERE case_id = ${`cl:${docketId}`} AND metadata ->> 'recapDocumentId' IS NOT NULL`);
  return (rows.rows[0] as { latest: string | null } | undefined)?.latest ?? null;
}

/**
 * Weekly pass: ingest new court-authored documents from enrolled dockets.
 * Returns counts for the snapshot log line.
 */
export async function ingestNewRecapDocuments(): Promise<{ stored: number; dockets: number }> {
  if (!isDbAvailable()) return { stored: 0, dockets: 0 };
  // Refreshing enrolledDocketIds first keeps this pass consistent with any
  // enrollment the discovery pass just made in the same cron run.
  await enrolledDocketIds();
  const cases = await enrolledCases();
  let stored = 0;
  for (const c of cases) {
    if (stored >= WEEKLY_INGEST_CAP) break;
    const floor = await lastIngestedDate(c.docketId);
    const candidates = await listDocketCandidates(c.docketId);
    for (const cand of candidates) {
      if (stored >= WEEKLY_INGEST_CAP) break;
      if (cand.verdict !== 'ingest') continue;
      if (floor && cand.dateFiled && cand.dateFiled <= floor.slice(0, 10)) continue;
      const text = await fetchRecapText(cand.recapId);
      await sleep(TEXT_FETCH_DELAY_MS);
      if (!text) continue;
      const item = buildRecapContentItem({
        caseLabel: c.label,
        docketId: c.docketId,
        candidate: cand,
        text: text.text,
        url: text.url,
      });
      for (const category of c.categories) {
        await storeDocuments([item], category);
      }
      stored++;
    }
  }
  return { stored, dockets: cases.length };
}
