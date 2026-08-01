/**
 * POST /api/cron/dump — start a database dump in the background.
 *
 * Protected by CRON_SECRET bearer token. Spawns pg_dump as a detached child
 * process so the dump survives the HTTP response, then returns 202 immediately.
 * Poll GET /api/cron/dump/status to learn when it finishes.
 *
 * Filesystem contract (on /var/data):
 *   - `database.pgdump.tmp` — exists while a dump is in progress.
 *   - `database.pgdump`     — last completed dump, served by /api/data/dump.
 *                             ABSENT while a dump runs (#560: the disk can't
 *                             hold two dumps; the old one is deleted first).
 *   - `dump-result.json`    — last result written by the spawner script.
 *   - `dump.log`            — pg_dump stderr from the most recent run.
 */

import { spawn } from 'child_process';
import { closeSync, existsSync, openSync, statSync, unlinkSync } from 'fs';
import type { NextApiRequest, NextApiResponse } from 'next';
import { isDumpTempStale } from '@/lib/cron/dump-config';
import { requireMethod, safeEqual } from '@/lib/utils/api-helpers';

const DUMP_DIR = '/var/data';
const DUMP_FILE = `${DUMP_DIR}/database.pgdump`;
const DUMP_TEMP = `${DUMP_FILE}.tmp`;
// Small companion dump of ONLY the PII tables, excluded from DUMP_FILE (#616)
// so the public download carries no emails. Uploaded to B2 only (never served)
// so the off-site backup is a COMPLETE, restorable image (#617 completeness).
const PII_FILE = `${DUMP_DIR}/pii-tables.pgdump`;
const RESULT_FILE = `${DUMP_DIR}/dump-result.json`;
const LOG_FILE = `${DUMP_DIR}/dump.log`;
// Off-site backup uploader (#617), invoked from the runner after a good dump.
const UPLOAD_SCRIPT = 'lib/cron/upload-backup.ts';
// Public download-copy uploader (#636): pushes the corpus dump to a PUBLIC B2
// bucket under a stable key so /api/data/dump can 302-redirect there.
const DOWNLOAD_UPLOAD_SCRIPT = 'lib/cron/upload-download.ts';

// Shell script that performs the dump and writes a result file atomically.
// Reads its inputs from env vars set by the spawning Node process — no user
// input is interpolated into this string, so it's safe from shell injection.
const RUNNER_SCRIPT = `
set -u
START=$(date +%s)
START_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
write_result() {
  printf '%s\\n' "$1" > "$RESULT_FILE.tmp" && mv "$RESULT_FILE.tmp" "$RESULT_FILE"
}
# Remove the previous dump BEFORE writing the new one (#560): the disk cannot
# hold two full dumps at once, and the ENOSPC failure also blanks the error
# log (it lives on the same disk). /api/data/dump 404s during the ~13-min
# window; db:init falls back to the GitHub Releases copy.
rm -f "$DUMP_FILE"
if pg_dump -Fc --no-owner --no-privileges --exclude-table-data=subscribers --exclude-table-data=feedback -f "$DUMP_TEMP" "$DATABASE_URL" 2>"$LOG_FILE"; then
  mv "$DUMP_TEMP" "$DUMP_FILE"
  END=$(date +%s)
  END_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  SIZE_BYTES=$(wc -c < "$DUMP_FILE" | tr -d ' ')
  DURATION=$((END - START))
  write_result "$(printf '{"status":"complete","sizeBytes":%s,"durationS":%s,"startedAt":"%s","completedAt":"%s"}' "$SIZE_BYTES" "$DURATION" "$START_ISO" "$END_ISO")"
  # Off-site backup (#617): verify the archive is readable, then upload to B2.
  # Best-effort — a good local dump is not blocked by an upload failure, but the
  # uploader always writes b2-result-<label>.json so the failure is visible in status.
  if pg_restore -l "$DUMP_FILE" >/dev/null 2>>"$LOG_FILE"; then
    npx tsx "$UPLOAD_SCRIPT" "$DUMP_FILE" database >>"$LOG_FILE" 2>&1 || echo "[dump] B2 corpus upload failed (see b2-result-database.json)" >>"$LOG_FILE"
    # Public download copy (#636): corpus dump → PUBLIC download bucket (stable
    # key) so /api/data/dump 302-redirects there and the origin egresses nothing.
    # Best-effort — a failure never blocks the dump or the off-site backup.
    npx tsx "$DOWNLOAD_UPLOAD_SCRIPT" "$DUMP_FILE" >>"$LOG_FILE" 2>&1 || echo "[dump] B2 download-bucket upload failed (see b2-result-download.json)" >>"$LOG_FILE"
    # Companion PII-tables dump → B2 only, so the backup is complete. Tiny
    # (emails + messages); fits the disk alongside the main dump. --data-only:
    # the main dump already carries the subscribers/feedback SCHEMA (just not
    # their data), so this loads cleanly into the restored empty tables.
    # Removed after upload so no PII lingers on the persistent disk.
    if pg_dump -Fc --no-owner --no-privileges --data-only --table=subscribers --table=feedback -f "$PII_FILE" "$DATABASE_URL" 2>>"$LOG_FILE"; then
      npx tsx "$UPLOAD_SCRIPT" "$PII_FILE" pii-tables >>"$LOG_FILE" 2>&1 || echo "[dump] B2 PII upload failed (see b2-result-pii-tables.json)" >>"$LOG_FILE"
      rm -f "$PII_FILE"
    else
      echo "[dump] PII-tables dump failed — off-site backup is incomplete" >>"$LOG_FILE"
    fi
  else
    echo "[dump] integrity check failed (pg_restore -l) — skipping B2 upload" >>"$LOG_FILE"
  fi
else
  EXIT=$?
  rm -f "$DUMP_TEMP"
  END_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)
  write_result "$(printf '{"status":"failed","exitCode":%s,"startedAt":"%s","failedAt":"%s"}' "$EXIT" "$START_ISO" "$END_ISO")"
fi
`;

/**
 * Concurrency guard. Returns true (and sends 409) when a dump is genuinely in
 * progress; reclaims a stale orphan (a crashed/killed dump's leftover .tmp) and
 * returns false so a fresh dump can proceed, so one crash can't block the weekly
 * cron indefinitely (#639).
 */
function rejectIfDumpInProgress(res: NextApiResponse): boolean {
  if (!existsSync(DUMP_TEMP)) return false;
  const stat = statSync(DUMP_TEMP);
  if (!isDumpTempStale(stat.mtime.getTime())) {
    res.status(409).json({ error: 'Dump already in progress', status: 'in_progress' });
    return true;
  }
  const idleS = Math.round((Date.now() - stat.mtime.getTime()) / 1000);
  console.warn(`[cron/dump] Reclaiming stale dump temp (idle ${idleS}s)`);
  unlinkSync(DUMP_TEMP);
  return false;
}

export default function handler(req: NextApiRequest, res: NextApiResponse): void {
  if (!requireMethod(req, res, 'POST')) return;

  const secret = process.env.CRON_SECRET;
  if (!secret) {
    res.status(503).json({ error: 'CRON_SECRET not configured' });
    return;
  }

  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token || !safeEqual(token, secret)) {
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

  // 409 if a dump is genuinely in progress; reclaim a stale orphan otherwise.
  if (rejectIfDumpInProgress(res)) return;

  // Reserve the .tmp marker synchronously so the status endpoint reports
  // "running" immediately, before the spawned pg_dump opens its output file.
  closeSync(openSync(DUMP_TEMP, 'w'));

  const startedAt = new Date().toISOString();
  const child = spawn('sh', ['-c', RUNNER_SCRIPT], {
    detached: true,
    stdio: 'ignore',
    env: {
      ...process.env, // carries B2_ENDPOINT/BUCKET/KEY_ID/APP_KEY to the uploader
      DATABASE_URL: dbUrl,
      DUMP_DIR,
      DUMP_FILE,
      DUMP_TEMP,
      PII_FILE,
      RESULT_FILE,
      LOG_FILE,
      UPLOAD_SCRIPT,
      DOWNLOAD_UPLOAD_SCRIPT,
    },
  });
  child.unref();

  console.log(`[cron/dump] Spawned pg_dump (pid=${child.pid}) at ${startedAt}`);
  res.status(202).json({ status: 'started', startedAt, pid: child.pid });
}
