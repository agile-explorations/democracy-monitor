import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';
import { computeHealthSummary, getLatestSourceHealth } from '@/lib/services/source-health-service';
import { requireMethod } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;

  // nosemgrep: opengrep.no-inline-db-guard
  if (!isDbAvailable()) {
    return res.status(200).json({ sources: [], summary: null });
  }

  const sources = await getLatestSourceHealth();
  const summary = computeHealthSummary(sources);
  return res.status(200).json({ sources, summary });
}
