import type { NextApiRequest, NextApiResponse } from 'next';
import { findSimilarDocuments } from '@/lib/services/search-service';
import { formatError, requireDb, requireMethod } from '@/lib/utils/api-helpers';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'GET')) return;
  if (!(await enforceRateLimit(req, res, RATE_LIMITS.search))) return;
  if (!requireDb(res)) return;

  const documentId = Number(req.query.documentId);
  if (isNaN(documentId) || documentId <= 0) {
    res.status(400).json({ error: 'Invalid document ID' });
    return;
  }

  try {
    const result = await findSimilarDocuments(documentId);
    res.status(200).json(result);
  } catch (err) {
    console.error(`[api/search/similar] Failed for doc ${documentId}:`, err);
    res.status(500).json({ error: formatError(err) });
  }
}
