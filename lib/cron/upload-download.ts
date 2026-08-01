/**
 * CLI: npx tsx lib/cron/upload-download.ts <dumpFile>
 *
 * Invoked by the weekly dump shell script after the corpus dump + off-site
 * backup succeed (#636). Uploads the PII-free corpus dump to the PUBLIC B2
 * download bucket under a stable key (`database.pgdump`, overwritten each run),
 * so /api/data/dump can 302-redirect there and the origin serves no 6.3 GB
 * egress. Writes b2-result-download.json so GET /api/cron/dump/status surfaces
 * the state. Best-effort: exit 0 = uploaded or skipped-unconfigured; exit 1 =
 * attempted and failed (visible in status, never silent).
 */

import { writeFileSync } from 'fs';
import {
  DOWNLOAD_OBJECT_KEY,
  readB2DownloadConfig,
  uploadFileToB2,
} from '@/lib/services/b2-backup';
import { formatError } from '@/lib/utils/api-helpers';

const DUMP_DIR = process.env.DUMP_DIR ?? '/var/data';

function writeResult(payload: Record<string, unknown>): void {
  writeFileSync(
    `${DUMP_DIR}/b2-result-download.json`,
    JSON.stringify({ ...payload, at: new Date().toISOString() }),
  );
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) throw new Error('usage: upload-download.ts <dumpFile>');

  const config = readB2DownloadConfig();
  if (!config) {
    console.log('[upload-download] B2 download bucket not configured — skipping public copy');
    writeResult({ status: 'skipped', reason: 'not_configured' });
    return;
  }

  console.log(
    `[upload-download] Uploading ${filePath} → ${config.bucket}/${DOWNLOAD_OBJECT_KEY} (public)...`,
  );
  const result = await uploadFileToB2(filePath, config, { key: DOWNLOAD_OBJECT_KEY });
  console.log(`[upload-download] Uploaded ${result.key} (${result.sizeBytes} bytes)`);
  writeResult({ status: 'uploaded', ...result });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    const message = formatError(err);
    console.error('[upload-download] Failed:', message);
    writeResult({ status: 'failed', error: message });
    process.exit(1);
  });
