/**
 * Salience-driven docket auto-discovery (#761).
 *
 * A static curated case list is a maintenance treadmill (owner concern,
 * 2026-08-20). This pass makes the corpus itself the tripwire: when the
 * record starts discussing a prosecution, its subject crosses the
 * hot-entity salience threshold within a refresh cycle, this pass finds the
 * criminal docket by party-name search, and enrollment happens with no
 * human in the loop. The seed config (lib/data/curated-dockets.ts) remains
 * for bootstrap + exceptions only.
 *
 * Precision guards: criminal docket-number pattern (-cr-), current-term
 * filing dates, already-enrolled dedup, and a hard weekly enrollment cap.
 * Every enrollment logs its own [snapshot] line (audit trail = one grep).
 *
 * I/O module — excluded from unit coverage; the candidate filter is pure
 * and unit-tested.
 */

import { sql } from 'drizzle-orm';
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { CURATED_DOCKETS, DEFAULT_DOCKET_CATEGORIES } from '@/lib/data/curated-dockets';
import { getDb, isDbAvailable } from '@/lib/db';
import {
  CL_API_V4,
  getAuthHeaders,
  RATE_LIMIT_DELAY_MS,
} from '@/lib/services/courtlistener-fetcher';
import { sleep } from '@/lib/utils/async';
import { fetchWithRetry } from '@/lib/utils/fetch-retry';

/** Person entities discussed by at least this many current-term docs. */
export const DISCOVERY_SALIENCE_FLOOR = 15;
/** Person entities checked per weekly run (rarest-first beyond the floor). */
const DISCOVERY_CANDIDATES_PER_RUN = 10;
/** Hard weekly enrollment cap — growth stays visible and bounded. */
export const DISCOVERY_ENROLL_CAP = 3;
/** Provenance tag marking a docket as document-ingest enrolled. */
export const RECAP_INGEST_PROVENANCE = 'recap_ingest';

export interface DiscoveredDocket {
  docketId: number;
  caseName: string;
  docketNumber: string;
  court: string;
  dateFiled: string | null;
}

interface ClSearchDocket {
  docket_id?: number;
  caseName?: string;
  docketNumber?: string;
  court?: string;
  court_id?: string;
  dateFiled?: string | null;
}

/** Criminal-docket candidate filter. Pure; exported for tests. */
export function isCriminalDocketCandidate(d: {
  docketNumber?: string | null;
  dateFiled?: string | null;
}): boolean {
  if (!d.docketNumber || !/-cr-/i.test(d.docketNumber)) return false;
  return Boolean(d.dateFiled && d.dateFiled >= T2_INAUGURATION);
}

/** A discovered case must actually NAME the person searched: the person's
 *  surname (last token, >=4 chars) appears in the caption. Guards against
 *  junk person entities whose loose search matches unrelated cases (the
 *  2026-08-24 "Image Jose" -> De La Cruz-Lopez enrollment). Pure. */
export function caseNameMatchesPerson(caseName: string, personName: string): boolean {
  const tokens = personName
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 4);
  if (tokens.length === 0) return false;
  const surname = tokens[tokens.length - 1].toLowerCase();
  return caseName.toLowerCase().includes(surname);
}

/** Party-name search for current-term criminal dockets. */
async function searchCriminalDockets(personName: string): Promise<DiscoveredDocket[]> {
  const url = `${CL_API_V4}/search/?type=r&q=${encodeURIComponent(`"${personName}"`)}&order_by=dateFiled desc`;
  const res = await fetchWithRetry(
    url,
    { headers: getAuthHeaders() },
    { label: `docket-discovery:${personName.slice(0, 24)}` },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as { results?: ClSearchDocket[] };
  return (data.results ?? [])
    .filter((d) => d.docket_id && isCriminalDocketCandidate(d))
    .map((d) => ({
      docketId: d.docket_id as number,
      caseName: d.caseName ?? '(untitled case)',
      docketNumber: d.docketNumber ?? '',
      court: d.court ?? d.court_id ?? '',
      dateFiled: d.dateFiled ?? null,
    }));
}

/** Docket ids already enrolled (seed config + provenance-tagged rows). */
export async function enrolledDocketIds(): Promise<Set<number>> {
  const enrolled = new Set<number>(CURATED_DOCKETS.flatMap((c) => c.docketIds));
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT docket_id FROM tracked_cases
    WHERE provenance @> ${JSON.stringify([RECAP_INGEST_PROVENANCE])}::jsonb`);
  for (const r of rows.rows as Array<{ docket_id: string | number }>) {
    enrolled.add(Number(r.docket_id));
  }
  return enrolled;
}

/** Hot person entities worth a docket search this week. */
async function hotPersonEntities(): Promise<string[]> {
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT phrase FROM hot_entities
    WHERE era = 'trump_t2' AND entity_class = 'person'
      AND doc_freq_term >= ${DISCOVERY_SALIENCE_FLOOR}
    ORDER BY doc_freq_term DESC
    LIMIT ${DISCOVERY_CANDIDATES_PER_RUN}`);
  return (rows.rows as Array<{ phrase: string }>).map((r) => r.phrase);
}

/** Enroll one discovered docket: upsert the tracked_cases row and tag it. */
async function enrollDocket(d: DiscoveredDocket): Promise<void> {
  const db = getDb();
  await db.execute(sql`
    INSERT INTO tracked_cases (
      case_id, docket_id, categories, case_name, docket_number,
      date_filed, status, provenance, first_seen_at, last_seen_at
    ) VALUES (
      ${`cl:${d.docketId}`}, ${d.docketId},
      ${JSON.stringify(DEFAULT_DOCKET_CATEGORIES)}::jsonb,
      ${d.caseName}, ${d.docketNumber},
      ${d.dateFiled}, 'open',
      ${JSON.stringify([RECAP_INGEST_PROVENANCE, 'discovery'])}::jsonb,
      now(), now()
    )
    ON CONFLICT (case_id) DO UPDATE SET
      provenance = (
        SELECT jsonb_agg(DISTINCT v) FROM jsonb_array_elements(
          tracked_cases.provenance || ${JSON.stringify([RECAP_INGEST_PROVENANCE, 'discovery'])}::jsonb
        ) AS v
      ),
      last_seen_at = now()`);
}

/**
 * Weekly discovery pass: hot person entities → criminal-docket search →
 * capped enrollment. Returns enrollment count for the snapshot log.
 */
export async function discoverAndEnrollDockets(): Promise<number> {
  if (!isDbAvailable()) return 0;
  const enrolled = await enrolledDocketIds();
  const people = await hotPersonEntities();
  let enrollments = 0;
  // CL keeps duplicate docket rows for one case (the Comey precedent):
  // dedupe within the run by docket NUMBER, not just id.
  const seenNumbers = new Set<string>();
  for (const person of people) {
    if (enrollments >= DISCOVERY_ENROLL_CAP) break;
    const dockets = await searchCriminalDockets(person);
    await sleep(RATE_LIMIT_DELAY_MS);
    for (const d of dockets) {
      if (enrollments >= DISCOVERY_ENROLL_CAP) break;
      if (enrolled.has(d.docketId)) continue;
      if (!caseNameMatchesPerson(d.caseName, person)) continue;
      const numberKey = `${d.court}:${d.docketNumber}`.toLowerCase();
      if (seenNumbers.has(numberKey)) continue;
      seenNumbers.add(numberKey);
      await enrollDocket(d);
      enrolled.add(d.docketId);
      enrollments++;
      console.log(
        `[snapshot] docket-discovery ENROLLED cl:${d.docketId} "${d.caseName}" (${d.docketNumber}, via "${person}")`,
      );
    }
  }
  return enrollments;
}
