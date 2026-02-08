import type { NextApiRequest, NextApiResponse } from 'next';
import { getDemoResponse } from '@/lib/demo';
import { fetchAllRhetoricSources } from '@/lib/services/intent-data-service';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const demo = getDemoResponse('intent/statements', _req);
  if (demo) return res.status(200).json(demo);

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
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
