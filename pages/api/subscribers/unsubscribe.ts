/**
 * GET /api/subscribers/unsubscribe?token=X — unsubscribe from weekly digest.
 *
 * One-click unsubscribe from email links. Redirects to /?unsubscribed=true.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { unsubscribeByToken } from '@/lib/services/subscriber-service';
import { requireDb, requireMethod } from '@/lib/utils/api-helpers';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'GET')) return;
  if (!requireDb(res)) return;

  const token = req.query.token as string;
  if (!token || !/^[a-f0-9]{64}$/.test(token)) {
    res.redirect('/?error=invalid-token');
    return;
  }

  try {
    await unsubscribeByToken(token);
    res.redirect('/?unsubscribed=true');
  } catch (err) {
    console.error('[api/subscribers/unsubscribe] Error:', err);
    res.redirect('/?error=unsubscribe-failed');
  }
}
