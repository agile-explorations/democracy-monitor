/**
 * POST /api/subscribers — subscribe to the weekly email digest.
 *
 * Body: { email: string }
 * Double opt-in: sends a confirmation email with a link to click.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod/v4';
import { createSubscriber } from '@/lib/services/subscriber-service';
import { requireDb, requireMethod } from '@/lib/utils/api-helpers';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit';

const SubscribeSchema = z.object({
  email: z.email('Invalid email address'),
});

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'POST')) return;
  if (!(await enforceRateLimit(req, res, RATE_LIMITS.email))) return;
  if (!requireDb(res)) return;

  const parsed = SubscribeSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0].message });
    return;
  }

  try {
    const { alreadyConfirmed } = await createSubscriber(parsed.data.email);
    const message = alreadyConfirmed
      ? 'You are already subscribed.'
      : 'Check your email to confirm your subscription.';
    res.status(200).json({ success: true, message });
  } catch (err) {
    console.error('[api/subscribers] Error:', err);
    res.status(500).json({ error: 'Failed to process subscription' });
  }
}
