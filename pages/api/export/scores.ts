import { and, gte, lte, eq } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { MAX_EXPORT_ROWS } from '@/lib/data/cache-config';
import { getDb } from '@/lib/db';
import { documentScores } from '@/lib/db/schema';
import { formatError, requireDb, requireMethod } from '@/lib/utils/api-helpers';
import { toCsv } from '@/lib/utils/csv';
import { checkRateLimit, getClientIp } from '@/lib/utils/rate-limit';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;

  const ip = getClientIp(req);
  const { allowed, retryAfterMs } = checkRateLimit(ip, { windowMs: 1000, maxRequests: 1 });
  if (!allowed) {
    res.setHeader('Retry-After', Math.ceil(retryAfterMs / 1000));
    return res.status(429).json({ error: 'Too many requests', retryAfterMs });
  }

  if (!requireDb(res)) return;

  const { category, from, to, format = 'json' } = req.query;

  try {
    const db = getDb();
    const conditions = [];
    if (category && typeof category === 'string') {
      conditions.push(eq(documentScores.category, category));
    }
    if (from && typeof from === 'string') {
      conditions.push(gte(documentScores.weekOf, from));
    }
    if (to && typeof to === 'string') {
      conditions.push(lte(documentScores.weekOf, to));
    }

    const rows = await db
      .select()
      .from(documentScores)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .limit(MAX_EXPORT_ROWS);

    if (format === 'csv') {
      const csvRows = rows.map((r) => ({
        ...r,
        matches: JSON.stringify(r.matches),
        suppressed: JSON.stringify(r.suppressed),
        scoredAt: r.scoredAt.toISOString(),
      }));
      const csv = toCsv(csvRows);
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="document-scores.csv"');
      return res.status(200).send(csv);
    }

    return res.status(200).json(rows);
  } catch (err) {
    console.error('[api/export/scores] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
