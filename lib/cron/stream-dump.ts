/**
 * CLI: npx tsx lib/cron/stream-dump.ts <runId>   (spawned detached by
 * POST /api/cron/dump; runId is a dump_runs row already in 'running' state)
 *
 * Diskless weekly dump (#731): pg_dump -Fc streams STRAIGHT to B2 — no local
 * staging, so the persistent disk (which foreclosed Render zero-downtime
 * deploys) can be removed. One pg_dump pass tees into two concurrent
 * multipart uploads (dated backup key + stable public download key); a
 * pg_dump failure aborts both (an aborted multipart never becomes a visible
 * object). Verification streams the uploaded backup object back through
 * `pg_restore -l`. The small PII-tables dump uploads separately (#617
 * completeness). Status/log live in the dump_runs row (heartbeat while
 * streaming); the slow-alias replay + index prewarm run at the end, in that
 * order (#729/#722).
 */

import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { PassThrough } from 'stream';
import type { Readable } from 'stream';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { eq } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { dumpRuns } from '@/lib/db/schema';
import type { B2Config } from '@/lib/services/b2-backup';
import {
  b2Client,
  backupObjectKey,
  createB2StreamUpload,
  DOWNLOAD_OBJECT_KEY,
  readB2Config,
  readB2DownloadConfig,
} from '@/lib/services/b2-backup';
import { formatError } from '@/lib/utils/api-helpers';

const HEARTBEAT_MS = 30_000;
const LOG_TAIL_LINES = 80; // dump + replay/prewarm lines both fit
const CORPUS_DUMP_ARGS = [
  '-Fc',
  '--no-owner',
  '--no-privileges',
  '--exclude-table-data=subscribers',
  '--exclude-table-data=feedback',
];
const PII_DUMP_ARGS = [
  '-Fc',
  '--no-owner',
  '--no-privileges',
  '--data-only',
  '--table=subscribers',
  '--table=feedback',
];

const logLines: string[] = [];
function log(msg: string): void {
  console.log(msg);
  logLines.push(`${new Date().toISOString()} ${msg}`);
}
const logTail = () => logLines.slice(-LOG_TAIL_LINES).join('\n');

type Db = ReturnType<typeof getDb>;

/** Run the corpus pg_dump, teeing stdout into every configured B2 target. */
async function streamCorpusDump(
  db: Db,
  runId: number,
  targets: Array<{ label: string; config: B2Config; key: string }>,
): Promise<{ sizeBytes: number; sha256: string }> {
  const child = spawn('pg_dump', [...CORPUS_DUMP_ARGS, process.env.DATABASE_URL as string]);
  child.stderr.on('data', (d: Buffer) => log(`[pg_dump] ${d.toString().trim()}`));

  const hash = createHash('sha256');
  let bytes = 0;
  child.stdout.on('data', (d: Buffer) => {
    bytes += d.length;
    hash.update(d);
  });

  const uploads = targets.map((t) => {
    const pt = new PassThrough();
    child.stdout.pipe(pt);
    const client = b2Client(t.config);
    const upload = createB2StreamUpload(client, t.config, t.key, pt);
    return { ...t, client, upload };
  });

  const heartbeat = setInterval(() => {
    void db
      .update(dumpRuns)
      .set({ heartbeatAt: new Date(), sizeBytes: bytes })
      .where(eq(dumpRuns.id, runId))
      .catch(() => undefined);
  }, HEARTBEAT_MS);

  const exitCode = new Promise<number>((resolve) => {
    child.on('close', (code) => resolve(code ?? 1));
  });

  try {
    const [code] = await Promise.all([exitCode, ...uploads.map((u) => u.upload.done())]);
    if (code !== 0) throw new Error(`pg_dump exited ${code}`);
    log(`corpus dump streamed: ${bytes} bytes to ${uploads.map((u) => u.label).join(' + ')}`);
    return { sizeBytes: bytes, sha256: hash.digest('hex') };
  } catch (err) {
    child.kill('SIGKILL');
    await Promise.allSettled(uploads.map((u) => u.upload.abort()));
    throw err;
  } finally {
    clearInterval(heartbeat);
    uploads.forEach((u) => u.client.destroy());
  }
}

/** Stream the uploaded object back through `pg_restore -l` (TOC listing). */
async function verifyUploadedDump(config: B2Config, key: string): Promise<boolean> {
  const client = b2Client(config);
  try {
    const obj = await client.send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
    const body = obj.Body as Readable;
    const restore = spawn('pg_restore', ['-l', '-f', '/dev/null']);
    body.pipe(restore.stdin);
    restore.stderr.on('data', (d: Buffer) => log(`[pg_restore] ${d.toString().trim()}`));
    const code = await new Promise<number>((resolve) =>
      restore.on('close', (c) => resolve(c ?? 1)),
    );
    log(`verify (pg_restore -l on ${key}): ${code === 0 ? 'OK' : `exit ${code}`}`);
    return code === 0;
  } finally {
    client.destroy();
  }
}

/** Small subscribers+feedback dump → backup bucket only (never public). */
async function uploadPiiDump(config: B2Config): Promise<Record<string, unknown>> {
  const key = backupObjectKey(new Date(), 'pii-tables');
  const child = spawn('pg_dump', [...PII_DUMP_ARGS, process.env.DATABASE_URL as string]);
  child.stderr.on('data', (d: Buffer) => log(`[pg_dump pii] ${d.toString().trim()}`));
  let bytes = 0;
  child.stdout.on('data', (d: Buffer) => (bytes += d.length));
  const client = b2Client(config);
  const upload = createB2StreamUpload(client, config, key, child.stdout);
  try {
    const [code] = await Promise.all([
      new Promise<number>((resolve) => child.on('close', (c) => resolve(c ?? 1))),
      upload.done(),
    ]);
    if (code !== 0) throw new Error(`pii pg_dump exited ${code}`);
    log(`pii dump uploaded: ${key} (${bytes} bytes)`);
    return { status: 'uploaded', key, sizeBytes: bytes, at: new Date().toISOString() };
  } catch (err) {
    await upload.abort().catch(() => undefined);
    throw err;
  } finally {
    client.destroy();
  }
}

/** Best-effort post-dump steps: slow-alias replay, then prewarm (#729/#722).
 *  Their console output is captured into the run row's logTail — the
 *  detached runner's stdio goes nowhere and the old dump.log is gone, so
 *  without this the Monday [alias-replay]/[prewarm] lines would be lost
 *  entirely (found during the v1.9.49 smoke). */
async function postDumpSteps(): Promise<void> {
  const original = { log: console.log, warn: console.warn };
  const capture =
    (base: (...args: unknown[]) => void) =>
    (...args: unknown[]) => {
      base(...args);
      logLines.push(`${new Date().toISOString()} ${args.map(String).join(' ')}`);
    };
  console.log = capture(original.log);
  console.warn = capture(original.warn);
  try {
    try {
      const { replaySlowAliases } = await import('@/lib/cron/replay-slow-aliases');
      await replaySlowAliases();
    } catch (err) {
      log(`[alias-replay] failed (non-blocking): ${formatError(err)}`);
    }
    try {
      const { prewarmSearchIndexes } = await import('@/lib/cron/prewarm-indexes');
      await prewarmSearchIndexes();
    } catch (err) {
      log(`[prewarm] failed (non-blocking): ${formatError(err)}`);
    }
  } finally {
    console.log = original.log;
    console.warn = original.warn;
  }
}

async function main(): Promise<void> {
  const runId = Number(process.argv[2]);
  if (!Number.isInteger(runId)) throw new Error('usage: stream-dump.ts <runId>');
  if (!isDbAvailable()) throw new Error('DATABASE_URL not set');
  // CLI entry (require.main block) calls loadEnvConfig before main runs.
  // nosemgrep: opengrep.cron-needs-env-config
  const db = getDb();
  const started = Date.now();

  const backupCfg = readB2Config();
  const downloadCfg = readB2DownloadConfig();
  const offsite: Record<string, unknown> = { database: null, piiTables: null, download: null };

  try {
    if (!backupCfg && !downloadCfg) {
      throw new Error('no B2 destination configured — a dump with nowhere to go is a failure');
    }
    const now = new Date();
    const targets = [
      ...(backupCfg
        ? [{ label: 'backup', config: backupCfg, key: backupObjectKey(now, 'database') }]
        : []),
      ...(downloadCfg
        ? [{ label: 'download', config: downloadCfg, key: DOWNLOAD_OBJECT_KEY }]
        : []),
    ];
    const { sizeBytes, sha256 } = await streamCorpusDump(db, runId, targets);
    for (const t of targets) {
      const entry = { status: 'uploaded', key: t.key, sizeBytes, at: new Date().toISOString() };
      if (t.label === 'backup') offsite.database = entry;
      else offsite.download = entry;
    }

    const verifyTarget = targets[0];
    const verified = await verifyUploadedDump(verifyTarget.config, verifyTarget.key);
    if (!verified) throw new Error('uploaded dump failed pg_restore -l verification');

    if (backupCfg) {
      offsite.piiTables = await uploadPiiDump(backupCfg);
    }

    await db
      .update(dumpRuns)
      .set({
        status: 'complete',
        finishedAt: new Date(),
        heartbeatAt: new Date(),
        sizeBytes,
        durationS: Math.round((Date.now() - started) / 1000),
        sha256,
        verified,
        offsite,
        logTail: logTail(),
      })
      .where(eq(dumpRuns.id, runId));
    log(`dump run ${runId} complete in ${Math.round((Date.now() - started) / 1000)}s`);
  } catch (err) {
    const message = formatError(err);
    log(`dump run ${runId} FAILED: ${message}`);
    await db
      .update(dumpRuns)
      .set({
        status: 'failed',
        finishedAt: new Date(),
        heartbeatAt: new Date(),
        durationS: Math.round((Date.now() - started) / 1000),
        error: message,
        offsite,
        logTail: logTail(),
      })
      .where(eq(dumpRuns.id, runId))
      .catch(() => undefined);
    await postDumpSteps();
    process.exit(1);
  }

  await postDumpSteps();
  // Persist any replay/prewarm log lines emitted after completion.
  await db
    .update(dumpRuns)
    .set({ logTail: logTail() })
    .where(eq(dumpRuns.id, runId))
    .catch(() => undefined);
  process.exit(0);
}

if (require.main === module) {
  const { loadEnvConfig } = require('@next/env');
  loadEnvConfig(process.cwd());
  main().catch((err) => {
    console.error('[stream-dump] fatal:', err);
    process.exit(1);
  });
}
