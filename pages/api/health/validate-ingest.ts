import type { NextApiRequest, NextApiResponse } from 'next';
import { runIngestValidation } from '@/lib/services/ingest-validation-service';
import { requireDb, requireMethod, formatError } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  try {
    const report = await runIngestValidation();
    return res.status(200).json(report);
  } catch (err) {
    console.error('[api/health/validate-ingest] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
