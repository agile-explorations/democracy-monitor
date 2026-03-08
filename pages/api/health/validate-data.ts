import type { NextApiRequest, NextApiResponse } from 'next';
import { runDataValidation } from '@/lib/services/data-validation-service';
import { requireDb, requireMethod, formatError } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  try {
    const report = await runDataValidation();
    return res.status(200).json(report);
  } catch (err) {
    console.error('[api/health/validate-data] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
