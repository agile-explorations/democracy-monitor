import type { NextApiRequest, NextApiResponse } from 'next';
import { getProposalDetail } from '@/lib/services/p2025-dashboard-service';
import { requireMethod, requireDb, formatError } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const { id } = req.query;

  if (!id || typeof id !== 'string') {
    return res.status(400).json({ error: 'Proposal ID is required' });
  }

  try {
    const detail = await getProposalDetail(id);

    if (!detail) {
      return res.status(404).json({ error: `Proposal ${id} not found` });
    }

    return res.status(200).json(detail);
  } catch (err) {
    return res.status(500).json({ error: formatError(err) });
  }
}
