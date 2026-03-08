import type { NextApiRequest, NextApiResponse } from 'next';
import { getEditorialRecord, getStoredNarratives } from '@/lib/services/narrative-store';
import type { NarrativeVersion } from '@/lib/types';
import { TERM_SUMMARY_CATEGORY } from '@/lib/types';
import {
  requireDb,
  requireMethod,
  requireWeekOf,
  formatError,
  tryStoredResponse,
  sendCached,
} from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const weekOf = requireWeekOf(req, res);
  if (!weekOf) return;

  const version = req.query.version as NarrativeVersion | undefined;
  if (version && version !== 'expert' && version !== 'public') {
    return res.status(400).json({ error: 'Invalid version. Must be "expert" or "public".' });
  }

  const editorial = req.query.editorial === 'true';

  try {
    if (editorial) {
      const record = await getEditorialRecord(TERM_SUMMARY_CATEGORY, weekOf);
      return sendCached(res, record);
    }

    const stored = await getStoredNarratives(TERM_SUMMARY_CATEGORY, weekOf);
    const cached = tryStoredResponse(stored, version);
    if (cached) return sendCached(res, cached);

    return res.status(200).json({ expert: null, public: null });
  } catch (err) {
    console.error('[api/narratives/term-summary] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
