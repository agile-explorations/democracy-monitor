import type { NextApiRequest, NextApiResponse } from 'next';
import { assessInformationAvailability } from '@/lib/services/information-availability';
import { getUptimeHistory } from '@/lib/services/uptime-service';
import { requireMethod } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;

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
