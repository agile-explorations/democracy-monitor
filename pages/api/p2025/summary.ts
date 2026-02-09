import type { NextApiRequest, NextApiResponse } from 'next';
import { getP2025Summary } from '@/lib/services/p2025-dashboard-service';
import { requireMethod, requireDb, formatError } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  try {
    const summary = await getP2025Summary();
    return res.status(200).json(summary);
  } catch (err) {
    return res.status(500).json({ error: formatError(err) });
  }
}
