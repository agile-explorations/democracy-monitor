import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import type { ContentItem } from '@/lib/types';

/**
 * tracked_cases ingest upsert (#695) — the linchpin of stub retirement: when
 * the weekly CL fetch surfaces docket activity (court_opinion items), the case
 * enters/updates the tracked-case universe here instead of persisting a
 * metadata-only stub document. Categories merge (a case can be routed to
 * several); posture/docket dates are NOT touched (bulk seed + weekly refresh
 * own those); provenance records 'ingest'.
 */
export async function upsertTrackedCasesFromItems(
  items: ContentItem[],
  category: string,
): Promise<number> {
  if (!isDbAvailable()) return 0;
  const db = getDb();
  let upserted = 0;
  for (const item of items) {
    const caseId = (item.metadata?.caseId as string) ?? item.caseId ?? null;
    const match = caseId ? /^cl:(\d{1,10})$/.exec(caseId) : null;
    if (!match) continue;
    try {
      await db.execute(sql`
        INSERT INTO tracked_cases (
          case_id, docket_id, categories, case_name, docket_number, nature_of_suit,
          date_filed, status, provenance, first_seen_at, last_seen_at
        ) VALUES (
          ${caseId},
          ${parseInt(match[1], 10)},
          ${JSON.stringify([category])}::jsonb,
          ${item.title || '(untitled case)'},
          ${(item.metadata?.docketNumber as string) ?? null},
          ${((item.metadata?.suitNature as string) ?? '')?.slice(0, 200) || null},
          ${item.pubDate ? item.pubDate.slice(0, 10) : null},
          'open',
          '["ingest"]'::jsonb,
          now(),
          now()
        )
        ON CONFLICT (case_id) DO UPDATE SET
          categories = CASE
            WHEN tracked_cases.categories @> ${JSON.stringify([category])}::jsonb
            THEN tracked_cases.categories
            ELSE tracked_cases.categories || ${JSON.stringify([category])}::jsonb
          END,
          last_seen_at = now(),
          provenance = CASE
            WHEN tracked_cases.provenance @> '["ingest"]'::jsonb THEN tracked_cases.provenance
            ELSE coalesce(tracked_cases.provenance, '[]'::jsonb) || '["ingest"]'::jsonb
          END
      `);
      upserted++;
    } catch (err) {
      console.error(`[tracked-case-store] upsert failed for ${caseId}:`, err);
    }
  }
  if (upserted > 0) console.log(`[tracked-case-store] ${category}: ${upserted} cases upserted`);
  return upserted;
}
