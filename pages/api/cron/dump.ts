/**
 * POST /api/cron/dump — trigger a database dump to persistent disk.
 *
 * Protected by CRON_SECRET bearer token. Called weekly by the dump cron job.
 * Spawns pg_dump as a child process (non-blocking) and returns 202 immediately.
 * The dump writes to a temp file, then atomically renames to the final path.
 */

import { exec } from 'child_process';
import { existsSync, statSync, unlinkSync } from 'fs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireMethod } from '@/lib/utils/api-helpers';

const DUMP_DIR = '/var/data';
const DUMP_FILE = `${DUMP_DIR}/database.pgdump`;
const DUMP_TEMP = `${DUMP_FILE}.tmp`;

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (!requireMethod(req, res, 'POST')) return;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'CRON_SECRET not configured' });
    return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token !== secret) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    res.status(503).json({ error: 'DATABASE_URL not configured' });
    return;
  }

  if (!existsSync(DUMP_DIR)) {
    res.status(503).json({ error: 'Persistent disk not mounted at /var/data' });
    return;
  }

  if (existsSync(DUMP_TEMP)) {
    res.status(409).json({ error: 'Dump already in progress' });
    return;
  }

  console.log('[cron/dump] Starting database dump...');
  const startTime = Date.now();

  exec(
    `pg_dump -Fc --no-owner --no-privileges -f "${DUMP_TEMP}" "${dbUrl}" && mv "${DUMP_TEMP}" "${DUMP_FILE}"`,
    { timeout: 600_000 },
    (error, _stdout, stderr) => {
      const durationMs = Date.now() - startTime;
      if (error) {
        console.error(`[cron/dump] Failed after ${durationMs}ms:`, stderr || error.message);
        try {
          unlinkSync(DUMP_TEMP);
        } catch {
          /* temp file may not exist */
        }
      } else {
        const size = statSync(DUMP_FILE).size;
        const sizeMB = (size / (1024 * 1024)).toFixed(0);
        console.log(`[cron/dump] Complete: ${sizeMB} MB in ${(durationMs / 1000).toFixed(0)}s`);
      }
    },
  );

  res.status(202).json({ message: 'Dump started' });
}
