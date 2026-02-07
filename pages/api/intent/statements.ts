import type { NextApiRequest, NextApiResponse } from 'next';
import { getDemoResponse } from '@/lib/demo';
import {
  fetchPresidentialDocuments,
  fetchWhiteHouseBriefings,
} from '@/lib/services/intent-data-service';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
  const demo = getDemoResponse('intent/statements', _req);
  if (demo) return res.status(200).json(demo);

  try {
    const [presidentialDocs, whBriefings] = await Promise.all([
      fetchPresidentialDocuments(),
      fetchWhiteHouseBriefings(),
    ]);

    const allStatements = [...presidentialDocs, ...whBriefings];

    res.status(200).json({
      statements: allStatements,
      count: allStatements.length,
      sources: {
        presidentialDocuments: presidentialDocs.length,
        whiteHouseBriefings: whBriefings.length,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
  }
}
