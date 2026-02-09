import type { NextApiRequest, NextApiResponse } from 'next';
import { isDbAvailable } from '@/lib/db';
import { computeRhetoricActionLag, computeAllLags } from '@/lib/services/lag-analysis-service';
import type { PolicyArea } from '@/lib/types/intent';

const VALID_AREAS: PolicyArea[] = [
  'rule_of_law',
  'civil_liberties',
  'elections',
  'media_freedom',
  'institutional_independence',
];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!isDbAvailable()) {
    return res.status(503).json({ error: 'Database not available' });
  }

  const { area, maxLag, from, to } = req.query;

  const options = {
    maxLagWeeks: maxLag ? Number(maxLag) : undefined,
    from: typeof from === 'string' ? from : undefined,
    to: typeof to === 'string' ? to : undefined,
  };

  try {
    if (area) {
      const policyArea = String(area) as PolicyArea;
      if (!VALID_AREAS.includes(policyArea)) {
        return res.status(400).json({
          error: `Invalid area. Must be one of: ${VALID_AREAS.join(', ')}`,
        });
      }
      const result = await computeRhetoricActionLag(policyArea, options);
      return res.status(200).json(result);
    }

    const results = await computeAllLags(options);
    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
