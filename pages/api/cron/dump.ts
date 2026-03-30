/**
 * POST /api/cron/dump — run a database dump to persistent disk.
 *
 * Protected by CRON_SECRET bearer token. Called weekly by the dump cron job.
 * Runs pg_dump synchronously (child process, non-blocking to event loop) and
 * returns 200 when complete. The cron's curl waits for the response.
 */

import { exec } from 'child_process';
import { existsSync, statSync, unlinkSync } from 'fs';
import { promisify } from 'util';
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireMethod } from '@/lib/utils/api-helpers';

const execAsync = promisify(exec);

const DUMP_DIR = '/var/data';
const DUMP_FILE = `${DUMP_DIR}/database.pgdump`;
const DUMP_TEMP = `${DUMP_FILE}.tmp`;

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
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

  try {
    await execAsync(
      `pg_dump -Fc --no-owner --no-privileges -f "${DUMP_TEMP}" "${dbUrl}" && mv "${DUMP_TEMP}" "${DUMP_FILE}"`,
      { timeout: 600_000, maxBuffer: 10 * 1024 * 1024 },
    );

    const size = statSync(DUMP_FILE).size;
    const sizeMB = (size / (1024 * 1024)).toFixed(0);
    const durationS = ((Date.now() - startTime) / 1000).toFixed(0);
    console.log(`[cron/dump] Complete: ${sizeMB} MB in ${durationS}s`);
    res.status(200).json({ success: true, sizeMB: Number(sizeMB), durationS: Number(durationS) });
  } catch (err) {
    const detail = (err as { stderr?: string }).stderr || (err as Error).message;
    console.error(`[cron/dump] Failed after ${Date.now() - startTime}ms:`, detail);
    try {
      unlinkSync(DUMP_TEMP);
    } catch {
      /* temp file may not exist */
    }
    res.status(500).json({ error: 'Dump failed', detail });
  }
}
