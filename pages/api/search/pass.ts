/**
 * POST /api/search/pass (#792): exchange a Cloudflare Turnstile token for a
 * signed `dm_pass` cookie — the human credential every expensive search
 * path requires. Cached answers never need it; the client asks for a pass
 * only when a request would start a cold build or a stream.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { issuePass, passEnforced } from '@/lib/services/search-pass';
import { verifyTurnstile } from '@/lib/services/turnstile';
import { requireMethod } from '@/lib/utils/api-helpers';
import { enforceRateLimit, getClientIp, RATE_LIMITS } from '@/lib/utils/rate-limit';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'POST')) return;
  if (!(await enforceRateLimit(req, res, RATE_LIMITS.search))) return;
  const token = (req.body as { turnstileToken?: unknown } | undefined)?.turnstileToken;
  // verifyTurnstile is fail-open only when no secret is configured; with a
  // secret, a missing/bad/timed-out token fails closed.
  const human = await verifyTurnstile(
    typeof token === 'string' ? token : undefined,
    getClientIp(req),
  );
  if (!human) {
    res.status(400).json({ error: 'Bot check failed — please retry.', code: 'turnstile_failed' });
    return;
  }
  const cookie = issuePass();
  if (!cookie) {
    // Enforcement is on but no signing secret exists — misconfiguration, not
    // the visitor's fault; say so loudly rather than 403 every search.
    if (passEnforced())
      console.error('[search-pass] SEARCH_PASS_SECRET/CRON_SECRET missing — cannot issue passes');
    res.status(204).end();
    return;
  }
  res.setHeader('Set-Cookie', cookie);
  res.status(204).end();
}
