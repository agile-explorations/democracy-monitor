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
 *    rows) get date_filed/date_terminated/date_last_filing re-read via
 *    per-docket GETs (the v4 dockets list endpoint rejects id__in — probed
 *    2026-08-10) — ≤200 API calls/run at 500ms politeness, ≪ 5k/hr.
 * 2. Tier-B posture: the top open cases per category by last filing get a
 *    docket-entries fetch + derivePosture cached into posture jsonb.
 */

export const REFRESH_CAP = 200;
const POSTURE_TOP_PER_CATEGORY = 3;
export const POSTURE_CALL_CAP = 40;
const RECENT_WINDOW_MONTHS = 18;

interface CandidateRow {
  case_id: string;
  docket_id: string;
}

interface DocketDates {
  id: number;
  date_filed: string | null;
  date_terminated: string | null;
  date_last_filing: string | null;
}

/** Fetch one docket's dates; null when CL has no such docket (deleted/sealed). */
async function fetchDocketDates(docketId: number): Promise<DocketDates | null> {
  const url = `${CL_API_V4}/dockets/${docketId}/?fields=id,date_filed,date_terminated,date_last_filing`;
  const response = await fetchWithRetry(
    url,
    { headers: getAuthHeaders() },
    { label: 'tracked-cases-refresh', timeoutMs: FETCH_TIMEOUT_MS },
  );
  if (response.status === 404) return null;
  if (!response.ok)
    throw new Error(`[cases:refresh] HTTP ${response.status} for docket ${docketId}`);
  return (await response.json()) as DocketDates;
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
  for (const [i, candidate] of candidates.entries()) {
    if (i > 0) await sleep(500);
    calls++;
    let docket: DocketDates | null;
    try {
      docket = await fetchDocketDates(parseInt(candidate.docket_id, 10));
    } catch (err) {
      console.warn(`[cases:refresh] ${candidate.case_id} failed (${err}); continuing`);
      continue;
    }
    {
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

/**
 * Copy the latest P2 AI-review reasoning for each case's opinions into
 * case_summary — the "what is this case about" line on litigation cards.
 * Deterministic SQL, zero API calls; new assessments flow in weekly.
 */
async function syncCaseSummaries(): Promise<number> {
  const db = getDb();
  const result = await db.execute(sql`
    UPDATE tracked_cases t SET case_summary = s.reasoning
    FROM (
      SELECT DISTINCT ON (d.case_id) d.case_id, a.reasoning
      FROM ai_document_assessments a
      JOIN documents d ON d.url = a.url AND d.category = a.category
      WHERE a.pass = 2 AND a.reasoning IS NOT NULL AND d.case_id LIKE 'cl:%'
      ORDER BY d.case_id, a.assessed_at DESC
    ) s
    WHERE t.case_id = s.case_id AND t.case_summary IS DISTINCT FROM s.reasoning`);
  return Number(result.rowCount ?? 0);
}

/** Run all refresh passes; returns a one-line summary for logs. */
export async function refreshTrackedCases(): Promise<string> {
  if (!isDbAvailable()) return 'db unavailable — skipped';
  const dates = await refreshDocketDates();
  const postures = await refreshPostures();
  const summaries = await syncCaseSummaries();
  // Pass 4 (#740/#761): salience-driven docket discovery + RECAP document
  // ingest for enrolled dockets. Both capped; failures degrade to zero
  // rather than failing the refresh (the errors channel is the caller's).
  let discovery = 0;
  let recap = { stored: 0, dockets: 0 };
  try {
    const { discoverAndEnrollDockets } = await import('@/lib/services/docket-discovery');
    discovery = await discoverAndEnrollDockets();
    const { ingestNewRecapDocuments } = await import('@/lib/services/recap-weekly');
    recap = await ingestNewRecapDocuments();
  } catch (err) {
    console.warn('[cases:refresh] recap pass failed (continuing):', err);
  }
  return (
    `dates: ${dates.refreshed} cases in ${dates.calls} calls; ` +
    `posture: ${postures.postured} cases in ${postures.calls} calls; ` +
    `summaries: ${summaries} synced; ` +
    `recap: ${recap.stored} docs from ${recap.dockets} dockets (+${discovery} discovered)`
  );
}
