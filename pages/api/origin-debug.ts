/**
 * GET /api/origin-debug — TEMPORARY diagnostic (#622).
 *
 * Reports which headers the origin actually receives, to pinpoint where the
 * Cloudflare-injected `x-dm-origin` header is lost (your CF not adding it vs a
 * downstream layer stripping it). Returns only header NAMES and booleans —
 * never the secret value. REMOVE once #620 enforcement is settled.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import { requireMethod } from '@/lib/utils/api-helpers';

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (!requireMethod(req, res, 'GET')) return;
  const origin = req.headers['x-dm-origin'];
  res.status(200).json({
    hasOriginHeader: origin !== undefined,
    cfRay: req.headers['cf-ray'] ?? null,
    cfHeaderNames: Object.keys(req.headers)
      .filter((h) => h.startsWith('cf-'))
      .sort(),
    allHeaderNames: Object.keys(req.headers).sort(),
  });
}
