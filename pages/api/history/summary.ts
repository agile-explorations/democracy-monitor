import { sql } from 'drizzle-orm';
import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable, getDb } from '@/lib/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isDbAvailable()) {
    return res.status(503).json({ error: 'Database not configured' });
  }

  try {
    const db = getDb();

    const docCounts = await db.execute(sql`
      SELECT category, COUNT(*)::int AS count,
        MIN(published_at) AS earliest,
        MAX(published_at) AS latest
      FROM documents
      WHERE published_at IS NOT NULL
      GROUP BY category
      ORDER BY category
    `);

    const snapshotCounts = await db.execute(sql`
      SELECT category, COUNT(*)::int AS count,
        MIN(assessed_at) AS earliest,
        MAX(assessed_at) AS latest
      FROM assessments
      GROUP BY category
      ORDER BY category
    `);

    const totalDocs = await db.execute(sql`
      SELECT COUNT(*)::int AS total FROM documents
    `);

    const totalSnapshots = await db.execute(sql`
      SELECT COUNT(*)::int AS total FROM assessments
    `);

    return res.status(200).json({
      documents: {
        total: (totalDocs.rows[0] as Record<string, unknown>)?.total || 0,
        byCategory: docCounts.rows,
      },
      snapshots: {
        total: (totalSnapshots.rows[0] as Record<string, unknown>)?.total || 0,
        byCategory: snapshotCounts.rows,
      },
    });
  } catch (err) {
    console.error('[api/history/summary] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch summary' });
  }
}
