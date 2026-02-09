import { and, gte, lte, eq } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable, getDb } from '@/lib/db';
import { weeklyAggregates } from '@/lib/db/schema';
import { toCsv } from '@/lib/utils/csv';
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit';

const MAX_EXPORT_ROWS = 10_000;

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ip = getClientIp(req);
  const { allowed, retryAfterMs } = checkRateLimit(ip, { windowMs: 1000, maxRequests: 1 });
  if (!allowed) {
    res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000));
    return res.status(429).json({ error: 'Too many requests', retryAfterMs });
  }

  if (!isDbAvailable()) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  const { category, from, to, format = 'json' } = req.query;

  try {
    const db = getDb();
    const conditions = [];
    if (category && typeof category === 'string') {
      conditions.push(eq(weeklyAggregates.category, category));
    }
    if (from && typeof from === 'string') {
      conditions.push(gte(weeklyAggregates.weekOf, from));
    }
    if (to && typeof to === 'string') {
      conditions.push(lte(weeklyAggregates.weekOf, to));
    }

    const rows = await db
      .select()
      .from(weeklyAggregates)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(MAX_EXPORT_ROWS);

    if (format === 'csv') {
      const csvRows = rows.map((r) => ({
        ...r,
        topKeywords: JSON.stringify(r.topKeywords),
        computedAt: r.computedAt.toISOString(),
      }));
      const csv = toCsv(csvRows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="weekly-aggregates.csv"');
      return res.status(200).send(csv);
    }

    return res.status(200).json(rows);
  } catch (err) {
    console.error('[api/export/weekly] Error:', err);
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
