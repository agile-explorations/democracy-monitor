/**
 * CLI: npx tsx lib/cron/upload-backup.ts <dumpFile> <label>
 *
 * Invoked by the weekly dump shell script after a successful pg_dump +
 * integrity check (#617). Uploads the dump to Backblaze B2 and writes
 * b2-result-<label>.json alongside the dump so GET /api/cron/dump/status can
 * surface the off-site backup state. `label` also becomes the object basename
 * (database | pii-tables), so the complete backup is two objects: the PII-free
 * corpus dump and a small subscribers+feedback dump (#617 completeness fix).
 * Exit 0 = uploaded or skipped-unconfigured; exit 1 = attempted and failed
 * (visible in the status endpoint, never silent).
 */

import { writeFileSync } from 'fs';
import { readB2Config, uploadFileToB2 } from '@/lib/services/b2-backup';
import { formatError } from '@/lib/utils/api-helpers';

const DUMP_DIR = process.env.DUMP_DIR ?? '/var/data';

function writeResult(label: string, payload: Record<string, unknown>): void {
  writeFileSync(
    `${DUMP_DIR}/b2-result-${label}.json`,
    JSON.stringify({ ...payload, at: new Date().toISOString() }),
  );
}

async function main(): Promise<void> {
  const filePath = process.argv[2];
  const label = process.argv[3] ?? 'database';
  if (!filePath) throw new Error('usage: upload-backup.ts <dumpFile> <label>');

  const config = readB2Config();
  if (!config) {
    console.log('[upload-backup] B2 not configured — skipping off-site backup');
    writeResult(label, { status: 'skipped', reason: 'not_configured' });
    return;
  }

  console.log(`[upload-backup] Uploading ${filePath} (${label}) to B2 bucket ${config.bucket}...`);
  const result = await uploadFileToB2(filePath, config, { basename: label });
  console.log(`[upload-backup] Uploaded ${result.key} (${result.sizeBytes} bytes)`);
  writeResult(label, { status: 'uploaded', ...result });
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    const message = formatError(err);
    console.error('[upload-backup] Failed:', message);
    writeResult(process.argv[3] ?? 'database', { status: 'failed', error: message });
    process.exit(1);
  });
