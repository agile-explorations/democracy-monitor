/** POST /api/admin/logout — clear admin session cookie. */

import type { NextApiRequest, NextApiResponse } from 'next';
import { ADMIN_COOKIE, requireMethod } from '@/lib/utils/api-helpers';

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (!requireMethod(req, res, 'POST')) return;

  res.setHeader('Set-Cookie', `${ADMIN_COOKIE}=; HttpOnly; Path=/; Max-Age=0`);
  res.status(200).json({ success: true });
}
