import type { NextApiRequest, NextApiResponse } from 'next';
import { checkAllSites, recordResults } from '@/lib/services/uptime-service';
import { getDemoResponse } from '@/lib/demo';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const demo = getDemoResponse('uptime/check', req);
  if (demo) return res.status(200).json(demo);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const results = await checkAllSites();
    await recordResults(results);

    const downSites = results.filter((r) => !r.isUp);

    res.status(200).json({
      checked: results.length,
      up: results.length - downSites.length,
      down: downSites.length,
      results,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Uptime check error:', err);
    res.status(500).json({ error: 'Uptime check failed' });
  }
}
