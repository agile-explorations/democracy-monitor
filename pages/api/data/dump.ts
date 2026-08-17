/**
 * GET /api/data/dump — download the latest database dump.
 *
 * 302 redirect to the public B2 download bucket (#636). The local-disk
 * fallback is gone (#731 — the persistent disk was removed so deploys can be
 * zero-downtime); when the B2 object is unreachable the response is 404 and
 * db:init falls back to the GitHub Releases copy. Supports HEAD.
 * Rate-limited per IP.
 */

import type { NextApiRequest, NextApiResponse } from 'next';
import {
  DOWNLOAD_OBJECT_KEY,
  downloadPublicUrl,
  readB2DownloadConfig,
} from '@/lib/services/b2-backup';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit';

/** True if the public B2 object exists (HEAD, short timeout). */
async function b2ObjectExists(url: string): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    return res.ok;
  } catch {
    return false;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  if (!(await enforceRateLimit(req, res, RATE_LIMITS.dataDump))) return;

  const dl = readB2DownloadConfig();
  if (dl) {
    const url = downloadPublicUrl(dl, DOWNLOAD_OBJECT_KEY);
    if (await b2ObjectExists(url)) {
      res.setHeader('Cache-Control', 'no-store');
      res.redirect(302, url);
      return;
    }
  }

  res.status(404).json({
    error:
      'Database dump not currently available. It is published weekly to the public download bucket.',
  });
}
