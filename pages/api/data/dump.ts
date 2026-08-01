/**
 * GET /api/data/dump — download the latest database dump.
 *
 * Prefers a 302 redirect to the public B2 download bucket (#636) so the origin
 * serves no multi-GB egress; falls back to streaming the local file when the B2
 * copy isn't configured or isn't present yet (before the first dump, or during
 * the brief window while a dump runs). Supports HEAD. Rate-limited per IP.
 */

import { createReadStream, existsSync, statSync } from 'fs';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  DOWNLOAD_OBJECT_KEY,
  downloadPublicUrl,
  readB2DownloadConfig,
} from '@/lib/services/b2-backup';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit';

export const config = { api: { responseLimit: false } };

const DUMP_FILE = '/var/data/database.pgdump';

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

  // Offload egress to the public B2 download bucket when the object is there.
  const dl = readB2DownloadConfig();
  if (dl) {
    const url = downloadPublicUrl(dl, DOWNLOAD_OBJECT_KEY);
    if (await b2ObjectExists(url)) {
      res.setHeader('Cache-Control', 'no-store');
      res.redirect(302, url);
      return;
    }
  }

  // Local fallback — stream the file from the persistent disk.
  if (!existsSync(DUMP_FILE)) {
    res.status(404).json({
      error: 'Database dump not available yet. The weekly dump has not run on this instance.',
    });
    return;
  }

  const stat = statSync(DUMP_FILE);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Disposition', 'attachment; filename="democracy-monitor.pgdump"');
  res.setHeader('Content-Length', stat.size);
  res.setHeader('Last-Modified', stat.mtime.toUTCString());
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'HEAD') {
    res.status(200).end();
    return;
  }

  const stream = createReadStream(DUMP_FILE);
  stream.pipe(res);
}
