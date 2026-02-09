import type { NextApiRequest, NextApiResponse } from 'next';
import { getDocumentExplanation } from '@/lib/services/explanation-service';
import { requireMethod, requireDb, formatError } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const { url } = req.query;
  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing required query parameter: url' });
  }

  try {
    const explanation = await getDocumentExplanation(url);
    if (!explanation) {
      return res.status(404).json({ error: 'No score found for the given URL' });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(200).json(explanation);
  } catch (err) {
    console.error('[api/explain/document] Error:', err);
    return res.status(500).json({ error: formatError(err) });
  }
}
