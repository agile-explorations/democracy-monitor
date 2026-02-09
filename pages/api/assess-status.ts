import type { NextApiRequest, NextApiResponse } from 'next';
import { enhancedAssessment } from '@/lib/services/ai-assessment-service';
import { analyzeContent } from '@/lib/services/assessment-service';
import { embedUnprocessedDocuments } from '@/lib/services/document-embedder';
import { storeDocuments } from '@/lib/services/document-store';
import { formatError } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const { category, items } = req.body;
    const useAI = req.query.ai === 'true';

    if (!category) {
      return res.status(400).json({ error: 'Missing category parameter' });
    }

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({ error: 'Missing or invalid items array' });
    }

    // Fire-and-forget: store documents and embed for RAG pipeline
    storeDocuments(items, category)
      .then(() => embedUnprocessedDocuments(20))
      .catch((err) => console.error(`RAG pipeline failed for ${category}:`, err));

    if (useAI) {
      const result = await enhancedAssessment(items, category);
      return res.status(200).json(result);
    }

    const assessment = analyzeContent(items, category);

    res.status(200).json({
      category,
      ...assessment,
      assessedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: formatError(err) });
  }
}
