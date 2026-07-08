import type { NextApiRequest, NextApiResponse } from 'next';
import { getSignificantWeeks } from '@/lib/services/significant-weeks-service';
import { requireDb, requireMethod, formatError, sendCached } from '@/lib/utils/api-helpers';

/** Deterministic index of notable weeks in the current term, most significant first. */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  try {
    const weeks = await getSignificantWeeks();
    return sendCached(res, { weeks });
  } catch (err) {
    console.error('[api/significant-weeks] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
