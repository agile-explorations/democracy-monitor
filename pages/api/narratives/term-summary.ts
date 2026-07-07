import type { NextApiRequest, NextApiResponse } from 'next';
import { getEditorialRecord } from '@/lib/services/narrative-store';
import { getCurrentTermSummary } from '@/lib/services/term-summary-queries';
import type { NarrativeVersion } from '@/lib/types';
import { TERM_SUMMARY_CATEGORY } from '@/lib/types';
import { requireDb, requireMethod, formatError, sendCached } from '@/lib/utils/api-helpers';

/**
 * The current living term summary — a single whole-term document regenerated
 * when underlying data changes. `weekOf` in the response is the week the
 * summary reflects ("as of"); no week parameter is accepted.
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const version = req.query.version as NarrativeVersion | undefined;
  if (version && version !== 'expert' && version !== 'public') {
    return res.status(400).json({ error: 'Invalid version. Must be "expert" or "public".' });
  }

  try {
    const current = await getCurrentTermSummary();

    if (req.query.editorial === 'true') {
      if (!current) return res.status(200).json(null);
      const record = await getEditorialRecord(TERM_SUMMARY_CATEGORY, current.weekOf);
      return sendCached(res, record);
    }

    if (!current) {
      return res.status(200).json({ expert: null, public: null, weekOf: null });
    }
    if (version) {
      return sendCached(res, { [version]: current[version], weekOf: current.weekOf });
    }
    return sendCached(res, {
      expert: current.expert,
      public: current.public,
      weekOf: current.weekOf,
    });
  } catch (err) {
    console.error('[api/narratives/term-summary] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
