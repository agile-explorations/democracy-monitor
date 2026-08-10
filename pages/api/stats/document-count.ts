/**
 * GET /api/stats/document-count — corpus counts for the dashboard hero
 * (cached 7 days; the weekly ingest cadence refreshes it in practice).
 *
 * Two numbers (#566 count semantics, revised #697):
 *   total    — every unique retrieval-relevant record. Docket stubs no
 *              longer exist in documents (retired to tracked_cases), so
 *              total ≈ fullText + GDELT metadata-only rhetoric rows.
 *   fullText — searchable full-text documents (the same substantive
 *              eligibility used by scoring, L2, and search: not
 *              metadata-only, ≥100 chars of content)
 */

import { countDistinct, sql } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { getDb } from '@/lib/db';
import { retrievalRelevantOnly } from '@/lib/db/document-filters';
import { documents } from '@/lib/db/schema';
import { requireDb, requireMethod, sendCached } from '@/lib/utils/api-helpers';

const ONE_WEEK = 7 * 24 * 60 * 60;

interface CorpusCounts {
  total: number;
  fullText: number;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  try {
    const cached = await cacheGet<CorpusCounts>(CacheKeys.documentCount());
    if (cached !== null && typeof cached === 'object' && 'fullText' in cached) {
      sendCached(res, cached);
      return;
    }

    const db = getDb();
    // fullText MUST NOT touch documents.content: length(content) detoasts
    // ~6GB per request and hangs the endpoint (2026-07-25 homepage incident).
    // "Searchable full-text" = what research search can actually return:
    // embedded and not metadata-only.
    const [row] = await db
      .select({
        total: countDistinct(documents.url),
        fullText: sql<number>`count(DISTINCT ${documents.url}) FILTER (WHERE ${documents.embeddedAt} IS NOT NULL AND ${documents.contentType} != 'metadata_only')`,
      })
      .from(documents)
      .where(retrievalRelevantOnly());
    const counts: CorpusCounts = { total: row.total, fullText: Number(row.fullText) };
    await cacheSet(CacheKeys.documentCount(), counts, ONE_WEEK);
    sendCached(res, counts);
  } catch (err) {
    console.error('[api/stats/document-count] error:', err);
    res.status(500).json({ error: 'Failed to count documents' });
  }
}
