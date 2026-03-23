import type { NextApiRequest, NextApiResponse } from 'next';
import { getDriftDrivingDocuments, getTypicalDocuments } from '@/lib/services/narrative-queries';
import { formatError, requireDb, requireMethod, requireWeekOf } from '@/lib/utils/api-helpers';
import { computeShiftTerms } from '@/lib/utils/tfidf';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const category = req.query.category as string | undefined;
  if (!category) {
    return res.status(400).json({ error: 'Missing required query parameter: category' });
  }
  const weekOf = requireWeekOf(req, res);
  if (!weekOf) return;

  try {
    const [typical, driftDriving] = await Promise.all([
      getTypicalDocuments(category, weekOf),
      getDriftDrivingDocuments(category, weekOf),
    ]);

    // Use titles only — content excerpts are dominated by FR metadata preamble
    // and boilerplate that drowns out topical signal. Titles are the most
    // semantically dense representation of what each document is about.
    const typicalTexts = typical.map((d) => d.title);
    const driftTexts = driftDriving.map((d) => d.title);
    const shiftLabels = computeShiftTerms(typicalTexts, driftTexts);

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=600');
    return res.status(200).json({ typical, driftDriving, shiftLabels });
  } catch (err) {
    return res.status(500).json({ error: formatError(err) });
  }
}
