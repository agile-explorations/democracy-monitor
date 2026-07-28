import type { NextApiRequest, NextApiResponse } from 'next';
import { DATA_DICTIONARY } from '@/lib/data/data-dictionary';
import { requireMethod } from '@/lib/utils/api-helpers';

/**
 * GET /api/export/dictionary — machine-readable data dictionary (#591).
 * Same registry as /data/dictionary; guard-tested against the flatteners
 * and schema, so it always describes the columns actually exported.
 */
export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (!requireMethod(req, res, 'GET')) return;
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.status(200).json({ artifacts: DATA_DICTIONARY });
}
