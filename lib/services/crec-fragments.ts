/**
 * Shared pieces of the CREC fragment pipeline (#704, #929): the candidate
 * predicate the builder and the ingest-health detector both use (so they can
 * never disagree about what is "unfragmented"), the assessed marker, and the
 * structure-preserving GovInfo fetch the builder, the rehearsal and the L2
 * canary all need. Services depend on this module; crons import it.
 */

import { sql } from 'drizzle-orm';
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import { CORPUS_CATEGORY } from '@/lib/db/document-filters';
import { stripHtmlPreserveLines } from '@/lib/parsers/feed-parser';

const GOVINFO_API_BASE = 'https://api.govinfo.gov';
/** Whole-day granules are always candidates; smaller ones only when several members spoke (#927). */
const MIN_WHOLE_DAY_BYTES = 102400;
/** The composite build's marker; the V1 `fragmentsAssessed` key is left as is. */
export const FRAGMENTS_ASSESSED_MARKER = 'fragmentsAssessedV2';

/** A granule the composite build should look at — whole-day sized, or flagged
 *  multi-speaker — that it has not assessed yet, published on or after `from`
 *  (the current term by default: baseline-era writes need owner approval per
 *  invocation, and the 2026-09-24 rehearsal showed baseline whole-day House
 *  records yield ~80 rows each). Granule level (one row per category). */
export function compositeCandidateSql(from: string = T2_INAUGURATION) {
  return sql`source_origin = 'crec' AND parent_id IS NULL
    AND category <> ${CORPUS_CATEGORY}
    AND metadata->>'granuleId' IS NOT NULL
    AND published_at >= ${from}::date
    AND (length(content) > ${MIN_WHOLE_DAY_BYTES} OR coalesce(metadata, '{}'::jsonb) ? 'speakerAmbiguous')
    AND NOT (coalesce(metadata, '{}'::jsonb) ? ${FRAGMENTS_ASSESSED_MARKER})`;
}

/** The granule's HTML from GovInfo, tags stripped with line boundaries kept
 *  (the splitter reads heading lines and speaker turns from them). Null on a
 *  non-2xx answer so the caller can retry the granule next run. */
export async function fetchStructuredGranule(
  granuleId: string,
  apiKey: string,
): Promise<string | null> {
  const packageId = granuleId.split('-').slice(0, 4).join('-');
  const url = `${GOVINFO_API_BASE}/packages/${packageId}/granules/${granuleId}/htm?api_key=${apiKey}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return stripHtmlPreserveLines(await res.text());
}
