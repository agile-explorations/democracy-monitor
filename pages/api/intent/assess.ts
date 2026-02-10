import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchIntentAssessment } from '@/lib/services/intent-orchestrator';
import { formatError } from '@/lib/utils/api-helpers';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const result = await fetchIntentAssessment();
    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: formatError(err) });
  }
}
