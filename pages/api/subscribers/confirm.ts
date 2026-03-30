/**
 * GET /api/subscribers/confirm?token=X — confirm email subscription.
 *
 * Redirects to /?confirmed=true on success, /?error=invalid-token on failure.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { confirmSubscriber } from '@/lib/services/subscriber-service';
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
    const confirmed = await confirmSubscriber(token);
    res.redirect(confirmed ? '/?confirmed=true' : '/?error=invalid-token');
  } catch (err) {
    console.error('[api/subscribers/confirm] Error:', err);
    res.redirect('/?error=confirmation-failed');
  }
}
