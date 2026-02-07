import type { NextApiRequest, NextApiResponse } from 'next';
import { getUptimeHistory } from '@/lib/services/uptime-service';
import { assessInformationAvailability } from '@/lib/services/information-availability';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const [histories, availability] = await Promise.all([
      getUptimeHistory(),
      assessInformationAvailability(),
    ]);

    res.status(200).json({
      sites: histories,
      availability,
      checkedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Uptime status error:', err);
    res.status(500).json({ error: 'Failed to get uptime status' });
  }
}
