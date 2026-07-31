/**
 * POST /api/admin/login — authenticate with ADMIN_PASSWORD, set session cookie.
 * GET  /api/admin/login — check if session is valid.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  ADMIN_COOKIE,
  ADMIN_SESSION_TTL_MS,
  makeAdminToken,
  safeEqual,
  verifyAdminToken,
} from '@/lib/utils/api-helpers';
import { RATE_LIMITS, enforceRateLimit } from '@/lib/utils/rate-limit';

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    res.status(503).json({ error: 'ADMIN_PASSWORD not configured' });
    return;
  }

  if (req.method === 'GET') {
    res.status(200).json({ authenticated: verifyAdminToken(password, req.cookies[ADMIN_COOKIE]) });
    return;
  }

  if (req.method === 'POST') {
    // Throttle brute-force before touching the password (per-IP).
    if (!(await enforceRateLimit(req, res, RATE_LIMITS.adminLogin))) return;

    const { password: submitted } = req.body ?? {};
    if (typeof submitted !== 'string' || !safeEqual(submitted, password)) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    const expiresAtMs = Date.now() + ADMIN_SESSION_TTL_MS;
    const token = makeAdminToken(password, expiresAtMs);
    const isProduction = process.env.NODE_ENV === 'production';
    res.setHeader(
      'Set-Cookie',
      `${ADMIN_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${Math.floor(
        ADMIN_SESSION_TTL_MS / 1000,
      )}${isProduction ? '; Secure' : ''}`,
    );
    res.status(200).json({ success: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
