/**
 * POST /api/admin/login — authenticate with ADMIN_PASSWORD, set session cookie.
 * GET  /api/admin/login — check if session is valid.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { ADMIN_COOKIE, makeAdminToken } from '@/lib/utils/api-helpers';

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    res.status(503).json({ error: 'ADMIN_PASSWORD not configured' });
    return;
  }

  if (req.method === 'GET') {
    const cookie = req.cookies[ADMIN_COOKIE];
    const valid = !!cookie && cookie === makeAdminToken(password);
    res.status(200).json({ authenticated: valid });
    return;
  }

  if (req.method === 'POST') {
    const { password: submitted } = req.body ?? {};
    if (typeof submitted !== 'string' || submitted !== password) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }

    const token = makeAdminToken(password);
    const isProduction = process.env.NODE_ENV === 'production';
    res.setHeader(
      'Set-Cookie',
      `${ADMIN_COOKIE}=${token}; HttpOnly; Path=/; SameSite=Strict; Max-Age=${60 * 60 * 24 * 7}${isProduction ? '; Secure' : ''}`,
    );
    res.status(200).json({ success: true });
    return;
  }

  res.status(405).json({ error: 'Method not allowed' });
}
