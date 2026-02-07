import type { NextApiRequest, NextApiResponse } from 'next';
import { fetchPresidentialDocuments, fetchWhiteHouseBriefings } from '@/lib/services/intent-data-service';

export default async function handler(_req: NextApiRequest, res: NextApiResponse) {
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
  } catch (err: any) {
    res.status(500).json({ error: String(err?.message || err) });
  }
}
