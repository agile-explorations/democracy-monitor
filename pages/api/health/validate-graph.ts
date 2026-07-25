import type { NextApiRequest, NextApiResponse } from 'next';
import { runGraphValidation } from '@/lib/cron/validate-graph';
import { formatError, requireDb, requireMethod } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  try {
    const results = await runGraphValidation();
    return res.status(200).json({ results });
  } catch (err) {
    console.error('[api/health/validate-graph] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
