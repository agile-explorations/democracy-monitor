import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchAllRhetoricSources } from '@/lib/services/intent-data-service';
import { formatError } from '@/lib/utils/api-helpers';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  try {
    const allStatements = await fetchAllRhetoricSources();

    // Build dynamic source breakdown
    const sources: Record<string, number> = {};
    for (const s of allStatements) {
      sources[s.source] = (sources[s.source] || 0) + 1;
    }

    res.status(200).json({
      statements: allStatements,
      count: allStatements.length,
      sources,
    });
  } catch (err) {
    res.status(500).json({ error: formatError(err) });
  }
}
