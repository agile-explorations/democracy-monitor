import type { NextApiRequest, NextApiResponse } from 'next';
import { getDemoResponse } from '@/lib/demo';
import { getDigest } from '@/lib/services/daily-digest-service';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const demo = getDemoResponse('digest', req);
  if (demo) return res.status(200).json(demo);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { date } = req.query;

  if (!date || typeof date !== 'string') {
    return res.status(400).json({ error: 'Date parameter required (YYYY-MM-DD)' });
  }

  // Validate date format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ error: 'Invalid date format. Use YYYY-MM-DD' });
  }

  try {
    const digest = await getDigest(date);
    if (!digest) {
      return res.status(404).json({ error: `No digest found for ${date}` });
    }
    res.status(200).json(digest);
  } catch (err) {
    console.error('Digest fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch digest' });
  }
}
