import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';
import { getDocumentExplanation } from '@/lib/services/explanation-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isDbAvailable()) {
    return res.status(503).json({ error: 'Database not configured' });
  }

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
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
