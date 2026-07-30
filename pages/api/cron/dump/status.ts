/**
 * GET /api/cron/dump/status — report the state of the last/current dump.
 *
 * Protected by CRON_SECRET. The weekly-dump cron polls this after triggering
 * POST /api/cron/dump.
 *
 * Possible response statuses:
 *   - `running`   — a `.tmp` file exists; dump is in flight.
 *   - `complete`  — last result file says complete.
 *   - `failed`    — last result file says failed; includes `logTail`.
 *   - `not_run`   — no result file and no `.tmp` (fresh disk).
 */

import { existsSync, readFileSync, statSync } from 'fs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { formatError, requireMethod } from '@/lib/utils/api-helpers';

const DUMP_DIR = '/var/data';
const DUMP_TEMP = `${DUMP_DIR}/database.pgdump.tmp`;
const RESULT_FILE = `${DUMP_DIR}/dump-result.json`;
const LOG_FILE = `${DUMP_DIR}/dump.log`;
const LOG_TAIL_LINES = 30;

function readB2Result(label: string): Record<string, unknown> | null {
  const file = `${DUMP_DIR}/b2-result-${label}.json`;
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch {
    // nosemgrep: opengrep.no-silent-catch — a corrupt off-site marker must not
    // break the dump-status read; absence/corruption reports as null.
    return null;
  }
}

/**
 * The off-site backup is two objects (#617): the PII-free corpus dump and a
 * small subscribers+feedback dump. Both must succeed for a complete backup.
 */
function readOffsiteResult(): Record<string, unknown> {
  return { database: readB2Result('database'), piiTables: readB2Result('pii-tables') };
}

type ResultPayload = Record<string, unknown> & { status: string };

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (!requireMethod(req, res, 'GET')) return;

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

  res.setHeader('Cache-Control', 'no-store');

  if (existsSync(DUMP_TEMP)) {
    const stat = statSync(DUMP_TEMP);
    const ageS = Math.round((Date.now() - stat.mtime.getTime()) / 1000);
    res.status(200).json({
      status: 'running',
      tempMtime: stat.mtime.toISOString(),
      ageS,
    });
    return;
  }

  if (existsSync(RESULT_FILE)) {
    let parsed: ResultPayload;
    try {
      parsed = JSON.parse(readFileSync(RESULT_FILE, 'utf8')) as ResultPayload;
    } catch (err) {
      res.status(500).json({
        status: 'unknown',
        error: 'Could not parse dump-result.json',
        detail: formatError(err),
      });
      return;
    }
    if (parsed.status === 'failed' && existsSync(LOG_FILE)) {
      const log = readFileSync(LOG_FILE, 'utf8');
      parsed.logTail = log.split('\n').slice(-LOG_TAIL_LINES).join('\n');
    }
    parsed.offsite = readOffsiteResult();
    res.status(200).json(parsed);
    return;
  }

  res.status(200).json({ status: 'not_run' });
}
