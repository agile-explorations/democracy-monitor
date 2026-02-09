import type { NextApiRequest, NextApiResponse } from 'next';
import { getDocumentHistory } from '@/lib/services/document-store';
import { requireMethod, requireDb } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const category = req.query.category as string;
  if (!category) {
    return res.status(400).json({ error: 'category parameter required' });
  }

  const from = (req.query.from as string) || undefined;
  const to = (req.query.to as string) || undefined;
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : undefined;

  try {
    const documents = await getDocumentHistory(category, { from, to, limit });
    return res.status(200).json(documents);
  } catch (err) {
    console.error('[api/history/documents] Error:', err);
    return res.status(500).json({ error: 'Failed to fetch documents' });
  }
}
