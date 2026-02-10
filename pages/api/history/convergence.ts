import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchWeeklyConvergenceData } from '@/lib/services/convergence-service';
import { requireDb, requireMethod } from '@/lib/utils/api-helpers';

/**
 * GET /api/history/convergence?from=2025-01-20&to=2026-02-08
 * Returns weekly infrastructure convergence data derived from assessment snapshots.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const from = (req.query.from as string) || '2025-01-20';
  const to = (req.query.to as string) || undefined;

  try {
    const data = await fetchWeeklyConvergenceData(from, to);
    return res.status(200).json(data);
  } catch (err) {
    console.error('[api/history/convergence] Error:', err);
    return res.status(500).json({ error: 'Failed to compute convergence' });
  }
}
