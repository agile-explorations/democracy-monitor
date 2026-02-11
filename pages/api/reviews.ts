import type { NextApiRequest, NextApiResponse } from 'next';
import { getPendingReviews, resolveReview } from '@/lib/services/review-queue';
import type { StatusLevel } from '@/lib/types';
import { formatError } from '@/lib/utils/api-helpers';

const VALID_STATUSES: StatusLevel[] = ['Stable', 'Warning', 'Drift', 'Capture'];

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    if (req.method === 'GET') {
      const reviews = await getPendingReviews();
      return res.status(200).json(reviews);
    }

    if (req.method === 'POST') {
      const { alertId, finalStatus, reason, reviewer, decision, feedback } = req.body;

      if (!alertId || !finalStatus || !reason || !reviewer) {
        return res.status(400).json({
          error: 'Missing required fields: alertId, finalStatus, reason, reviewer',
        });
      }

      if (!VALID_STATUSES.includes(finalStatus)) {
        return res.status(400).json({
          error: `Invalid finalStatus: must be one of ${VALID_STATUSES.join(', ')}`,
        });
      }

      await resolveReview(Number(alertId), {
        finalStatus,
        reason,
        reviewer,
        decision: decision ?? 'approve',
        feedback,
      });
      return res.status(200).json({ success: true });
    }

    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    res.status(500).json({ error: formatError(err) });
  }
}
