/**
 * GET /api/data/dump — download the latest database dump.
 *
 * Streams the pg_dump custom-format file from the persistent disk.
 * Supports HEAD requests for size checks. Returns 404 if no dump exists yet.
 */

import { createReadStream, existsSync, statSync } from 'fs';
import type { NextApiRequest, NextApiResponse } from 'next';

export const config = { api: { responseLimit: false } };

const DUMP_FILE = '/var/data/database.pgdump';

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

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
