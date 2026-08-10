import { sql } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb } from '@/lib/db';
import { formatError, requireDb, requireMethod } from '@/lib/utils/api-helpers';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit';

/**
 * GET /api/category/cases?key=<category>&status=open|all&page=N — tracked
 * litigation for a category's Litigation panel (#696). key=_all returns the
 * combined cross-category list for the home page. Serves tracked_cases only
 * (zero CourtListener calls); Redis-cached 24h per page.
 */

const ALL_CATEGORIES_KEY = '_all';

const PAGE_SIZE = 10;
const CACHE_TTL_S = 24 * 60 * 60;

export interface TrackedCaseListItem {
  caseId: string;
  categories: string[];
  caseName: string;
  courtName: string | null;
  docketNumber: string | null;
  natureOfSuit: string | null;
  dateFiled: string | null;
  dateTerminated: string | null;
  dateLastFiling: string | null;
  status: string;
  posture: { line: string; asOf: string } | null;
}

interface CasesPayload {
  cases: TrackedCaseListItem[];
  openCount: number;
  totalCount: number;
  page: number;
  hasMore: boolean;
}

async function queryCases(key: string, status: string, page: number): Promise<CasesPayload> {
  const db = getDb();
  const statusCond = status === 'open' ? sql`AND status = 'open'` : sql``;
  const categoryCond =
    key === ALL_CATEGORIES_KEY ? sql`true` : sql`categories @> ${JSON.stringify([key])}::jsonb`;
  const rows = (
    await db.execute(sql`
      SELECT case_id, categories, case_name, court_name, docket_number, nature_of_suit,
        date_filed::text, date_terminated::text, date_last_filing::text, status, posture
      FROM tracked_cases
      WHERE ${categoryCond} ${statusCond}
      ORDER BY date_last_filing DESC NULLS LAST, case_id
      LIMIT ${PAGE_SIZE + 1} OFFSET ${(page - 1) * PAGE_SIZE}`)
  ).rows as Array<Record<string, unknown>>;
  const counts = (
    await db.execute(sql`
      SELECT count(*) FILTER (WHERE status = 'open') AS open, count(*) AS total
      FROM tracked_cases WHERE ${categoryCond}`)
  ).rows[0] as { open: string; total: string };

  return {
    cases: rows.slice(0, PAGE_SIZE).map(
      (r): TrackedCaseListItem => ({
        caseId: r.case_id as string,
        categories: (r.categories as string[]) ?? [],
        caseName: r.case_name as string,
        courtName: (r.court_name as string) ?? null,
        docketNumber: (r.docket_number as string) ?? null,
        natureOfSuit: (r.nature_of_suit as string) ?? null,
        dateFiled: (r.date_filed as string) ?? null,
        dateTerminated: (r.date_terminated as string) ?? null,
        dateLastFiling: (r.date_last_filing as string) ?? null,
        status: r.status as string,
        posture: (r.posture as { line: string; asOf: string }) ?? null,
      }),
    ),
    openCount: Number(counts.open),
    totalCount: Number(counts.total),
    page,
    hasMore: rows.length > PAGE_SIZE,
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'GET')) return;
  if (!(await enforceRateLimit(req, res, RATE_LIMITS.categoryCases))) return;
  if (!requireDb(res)) return;

  const key = String(req.query.key ?? '');
  const status = req.query.status === 'all' ? 'all' : 'open';
  const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10) || 1);
  if (key !== ALL_CATEGORIES_KEY && !CATEGORIES.some((c) => c.key === key)) {
    res.status(400).json({ error: 'Unknown category' });
    return;
  }

  try {
    const cacheKey = CacheKeys.categoryCases(key, status, page);
    const cached = await cacheGet<object>(cacheKey);
    if (cached !== null && typeof cached === 'object' && 'cases' in cached) {
      res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
      res.status(200).json(cached);
      return;
    }

    const payload = await queryCases(key, status, page);
    await cacheSet(cacheKey, payload, CACHE_TTL_S);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    res.status(200).json(payload);
  } catch (err) {
    console.error(`[api/category/cases] Failed for ${key}:`, err);
    res.status(500).json({ error: formatError(err) });
  }
}
