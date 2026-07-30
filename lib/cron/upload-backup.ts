/**
 * CLI: npx tsx lib/cron/upload-backup.ts <dumpFile>
 *
 * Invoked by the weekly dump shell script after a successful pg_dump +
 * integrity check (#617). Uploads the dump to Backblaze B2 and writes
 * b2-result.json alongside the dump so GET /api/cron/dump/status can surface
 * the off-site backup state. Exit 0 = uploaded or skipped-unconfigured;
 * exit 1 = attempted and failed (visible in the status endpoint, never silent).
 */

import { writeFileSync } from 'fs';
import { readB2Config, uploadFileToB2 } from '@/lib/services/b2-backup';
import { formatError } from '@/lib/utils/api-helpers';

const B2_RESULT_FILE = `${process.env.DUMP_DIR ?? '/var/data'}/b2-result.json`;

function writeResult(payload: Record<string, unknown>): void {
  writeFileSync(B2_RESULT_FILE, JSON.stringify({ ...payload, at: new Date().toISOString() }));
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  if (!filePath) throw new Error('usage: upload-backup.ts <dumpFile>');

  const config = readB2Config();
  if (!config) {
    console.log('[upload-backup] B2 not configured — skipping off-site backup');
    writeResult({ status: 'skipped', reason: 'not_configured' });
    return;
  }

  console.log(`[upload-backup] Uploading ${filePath} to B2 bucket ${config.bucket}...`);
  const result = await uploadFileToB2(filePath, config);
  console.log(`[upload-backup] Uploaded ${result.key} (${result.sizeBytes} bytes)`);
  writeResult({ status: 'uploaded', ...result });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    const message = formatError(err);
    console.error('[upload-backup] Failed:', message);
    writeResult({ status: 'failed', error: message });
    process.exit(1);
  });
