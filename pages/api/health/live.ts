/**
 * GET /api/health/live — liveness probe for Render's health check (#620).
 *
 * Render probes the origin directly (bypassing Cloudflare), so this path is
 * allowlisted in the origin-secret middleware. Returns 200 with no data.
 */

import type { NextApiRequest, NextApiResponse } from 'next';

export default function handler(_req: NextApiRequest, res: NextApiResponse): void {
  res.status(200).json({ ok: true });
}
