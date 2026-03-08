import type { NextApiRequest, NextApiResponse } from 'next';
import { CATEGORIES } from '@/lib/data/categories';
import { hasUnresolvedFailure } from '@/lib/services/narrative-failure-store';
import { getEditorialRecord, getStoredNarratives } from '@/lib/services/narrative-store';
import type { NarrativeVersion } from '@/lib/types';
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

  const categoryKey = req.query.category as string;
  const category = CATEGORIES.find((c) => c.key === categoryKey);
  if (!category) {
    return res.status(404).json({ error: `Unknown category: ${categoryKey}` });
  }

  const weekOf = requireWeekOf(req, res);
  if (!weekOf) return;

  const version = req.query.version as NarrativeVersion | undefined;
  if (version && version !== 'expert' && version !== 'public') {
    return res.status(400).json({ error: 'Invalid version. Must be "expert" or "public".' });
  }

  const editorial = req.query.editorial === 'true';

  try {
    if (editorial) {
      const record = await getEditorialRecord(categoryKey, weekOf);
      return sendCached(res, record);
    }

    const stored = await getStoredNarratives(categoryKey, weekOf);
    const cached = tryStoredResponse(stored, version);
    if (cached) return sendCached(res, cached);

    const failed = await hasUnresolvedFailure(categoryKey, weekOf);
    if (failed) {
      return res.status(200).json({ expert: null, public: null, failed: true });
    }

    return res.status(200).json({ expert: null, public: null });
  } catch (err) {
    console.error(`[api/narratives/${categoryKey}] Error:`, err);
    return res.status(500).json({ error: formatError(err) });
  }
}
