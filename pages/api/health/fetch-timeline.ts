import type { NextApiRequest, NextApiResponse } from 'next';
import { getWeeklyFetchHealth } from '@/lib/services/fetch-log-store';
import { requireDb, requireMethod } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const data = await getWeeklyFetchHealth();
  return res.status(200).json(data);
}
