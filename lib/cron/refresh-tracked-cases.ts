import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { CL_API_V4, FETCH_TIMEOUT_MS, getAuthHeaders } from '@/lib/services/courtlistener-fetcher';
import {
  buildCaseTimeline,
  derivePosture,
  fetchDocketEntries,
} from '@/lib/services/docket-timeline';
import { sleep } from '@/lib/utils/async';
import { fetchWithRetry } from '@/lib/utils/fetch-retry';

/**
 * Weekly tracked_cases refresh (#695) — snapshot post-step. Two passes, both
 * hard-capped and deterministic:
 * 1. Docket-date sweep: open cases with recent activity (plus never-refreshed
 *    rows) get date_filed/date_terminated/date_last_filing re-read from the CL
 *    v4 dockets endpoint in id__in batches — ≤10 API calls for the cap of 200.
 * 2. Tier-B posture: the top open cases per category by last filing get a
 *    docket-entries fetch + derivePosture cached into posture jsonb.
 */

export const REFRESH_CAP = 200;
const BATCH_SIZE = 20;
const POSTURE_TOP_PER_CATEGORY = 3;
export const POSTURE_CALL_CAP = 40;
const RECENT_WINDOW_MONTHS = 18;

interface CandidateRow {
  case_id: string;
  docket_id: string;
}

async function fetchDocketBatch(docketIds: number[]): Promise<
  Array<{
    id: number;
    date_filed: string | null;
    date_terminated: string | null;
    date_last_filing: string | null;
  }>
> {
  const url =
    `${CL_API_V4}/dockets/?id__in=${docketIds.join(',')}` +
    `&fields=id,date_filed,date_terminated,date_last_filing&page_size=${BATCH_SIZE}`;
  const response = await fetchWithRetry(
    url,
    { headers: getAuthHeaders() },
    { label: 'tracked-cases-refresh', timeoutMs: FETCH_TIMEOUT_MS },
  );
  if (!response.ok) throw new Error(`[cases:refresh] HTTP ${response.status} for docket batch`);
  const data = (await response.json()) as {
    results?: Array<{
      id: number;
      date_filed: string | null;
      date_terminated: string | null;
      date_last_filing: string | null;
    }>;
  };
  return data.results ?? [];
}

async function refreshDocketDates(): Promise<{ refreshed: number; calls: number }> {
  const db = getDb();
  const candidates = (
    await db.execute(sql`
      SELECT case_id, docket_id::text FROM tracked_cases
      WHERE refreshed_at IS NULL
         OR (status = 'open' AND (date_last_filing IS NULL OR date_last_filing > now() - make_interval(months => ${RECENT_WINDOW_MONTHS})))
      ORDER BY refreshed_at ASC NULLS FIRST
      LIMIT ${REFRESH_CAP}`)
  ).rows as unknown as CandidateRow[];

  let calls = 0;
  let refreshed = 0;
  for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
    const batch = candidates.slice(i, i + BATCH_SIZE);
    if (i > 0) await sleep(2000);
    calls++;
    let results: Awaited<ReturnType<typeof fetchDocketBatch>>;
    try {
      results = await fetchDocketBatch(batch.map((c) => parseInt(c.docket_id, 10)));
    } catch (err) {
      console.warn(`[cases:refresh] batch failed (${err}); continuing`);
      continue;
    }
    const byId = new Map(results.map((r) => [r.id, r]));
    for (const candidate of batch) {
      const docket = byId.get(parseInt(candidate.docket_id, 10));
      // Absent from CL (deleted/sealed): stamp refreshed_at so the queue drains.
      await db.execute(sql`
        UPDATE tracked_cases SET
          date_filed = COALESCE(${docket?.date_filed ?? null}, date_filed),
          date_terminated = COALESCE(${docket?.date_terminated ?? null}, date_terminated),
          date_last_filing = CASE
            WHEN COALESCE(${docket?.date_last_filing ?? null}, date_last_filing::text)::date > current_date + 1
            THEN NULL
            ELSE COALESCE(${docket?.date_last_filing ?? null}, date_last_filing)
          END,
          status = CASE WHEN COALESCE(${docket?.date_terminated ?? null}, date_terminated::text) IS NOT NULL
                        THEN 'terminated' ELSE 'open' END,
          refreshed_at = now()
        WHERE case_id = ${candidate.case_id}`);
      refreshed++;
    }
  }
  return { refreshed, calls };
}

async function refreshPostures(): Promise<{ postured: number; calls: number }> {
  const db = getDb();
  const targets = (
    await db.execute(sql`
      SELECT DISTINCT ON (case_id) case_id, docket_id::text FROM (
        SELECT t.case_id, t.docket_id, c.cat,
          row_number() OVER (PARTITION BY c.cat ORDER BY t.date_last_filing DESC NULLS LAST) AS rn
        FROM tracked_cases t
        CROSS JOIN LATERAL jsonb_array_elements_text(t.categories) AS c(cat)
        WHERE t.status = 'open'
      ) ranked WHERE rn <= ${POSTURE_TOP_PER_CATEGORY}
      LIMIT ${POSTURE_CALL_CAP}`)
  ).rows as unknown as CandidateRow[];

  let calls = 0;
  let postured = 0;
  for (const target of targets) {
    if (calls >= POSTURE_CALL_CAP) break;
    await sleep(2000);
    calls++;
    try {
      const docketId = parseInt(target.docket_id, 10);
      const page = await fetchDocketEntries(docketId);
      const timeline = buildCaseTimeline(target.case_id, docketId, page, new Date().toISOString());
      const posture = timeline.posture ?? derivePosture(timeline.entries);
      if (!posture) continue;
      await db.execute(sql`
        UPDATE tracked_cases
        SET posture = ${JSON.stringify({ ...posture, asOf: timeline.asOf })}::jsonb
        WHERE case_id = ${target.case_id}`);
      postured++;
    } catch (err) {
      console.warn(`[cases:refresh] posture failed for ${target.case_id}: ${err}`);
    }
  }
  return { postured, calls };
}

/** Run both refresh passes; returns a one-line summary for logs. */
export async function refreshTrackedCases(): Promise<string> {
  if (!isDbAvailable()) return 'db unavailable — skipped';
  const dates = await refreshDocketDates();
  const postures = await refreshPostures();
  return (
    `dates: ${dates.refreshed} cases in ${dates.calls} calls; ` +
    `posture: ${postures.postured} cases in ${postures.calls} calls`
  );
}
