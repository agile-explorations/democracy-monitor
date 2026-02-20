import type { NextApiRequest, NextApiResponse } from 'next';
import { getConfigSnapshot } from '@/lib/services/explanation-service';
import { requireMethod } from '@/lib/utils/api-helpers';

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;

  const snapshot = getConfigSnapshot();
  res.setHeader('Cache-Control', 'public, max-age=86400');
  return res.status(200).json(snapshot);
}
