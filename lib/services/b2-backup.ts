/**
 * Off-provider database-backup upload to Backblaze B2 (#617).
 *
 * Fixes the single-Render-account blast radius: after the weekly pg_dump
 * succeeds, the archive is uploaded to a B2 bucket in a separate provider.
 * The bucket has Object Lock in Compliance mode with a ~30-day default
 * retention, so uploaded backups are immutable — a compromised app key (or
 * Render account) cannot delete them within the retention window. A B2
 * Lifecycle Rule reclaims objects after they age out; this code only uploads.
 *
 * The upload streams the ~6 GB dump in parts (lib-storage), so memory stays
 * bounded regardless of dump size.
 */

import type { Readable } from 'stream';
import { S3Client } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';

export interface B2Config {
  endpoint: string;
  region: string;
  bucket: string;
  keyId: string;
  appKey: string;
}

const UPLOAD_PART_SIZE = 100 * 1024 * 1024; // 100 MB parts (~60 for a 6 GB dump)
const UPLOAD_QUEUE_SIZE = 4;

/**
 * Extract the region from a B2 S3 endpoint
 * (https://s3.us-west-004.backblazeb2.com → us-west-004). The AWS SDK requires
 * a region even though B2 embeds it in the endpoint; a mismatch is rejected by
 * B2, so we derive it rather than take a separate env var.
 */
export function parseB2Region(endpoint: string): string {
  const host = new URL(endpoint).hostname; // s3.<region>.backblazeb2.com
  const parts = host.split('.');
  if (parts.length < 4 || parts[0] !== 's3') {
    throw new Error(`Unrecognized B2 endpoint host: ${host}`);
  }
  return parts[1];
}

/** Dated, prefixed object key for a backup, e.g. db-backups/database-2026-07-30.pgdump */
export function backupObjectKey(now: Date, basename = 'database', prefix = 'db-backups'): string {
  const date = now.toISOString().slice(0, 10);
  return `${prefix}/${basename}-${date}.pgdump`;
}

/**
 * Read B2 config from the environment. Returns null (not an error) when B2 is
 * not configured, so the dump pipeline treats off-site backup as optional and
 * a missing config is a logged skip, not a failure.
 */
export function readB2Config(env: NodeJS.ProcessEnv = process.env): B2Config | null {
  const { B2_ENDPOINT, B2_BUCKET, B2_KEY_ID, B2_APP_KEY } = env;
  if (!B2_ENDPOINT || !B2_BUCKET || !B2_KEY_ID || !B2_APP_KEY) return null;
  return {
    endpoint: B2_ENDPOINT,
    region: parseB2Region(B2_ENDPOINT),
    bucket: B2_BUCKET,
    keyId: B2_KEY_ID,
    appKey: B2_APP_KEY,
  };
}

/** Stable object key for the public download copy — overwritten each dump (#636). */
export const DOWNLOAD_OBJECT_KEY = 'database.pgdump';

/**
 * B2 config for the PUBLIC download bucket (#636). A separate bucket with its
 * own write-only key, so no credential here can READ the backup bucket (which
 * holds the PII-tables dump + repo backups). Shares the B2_ENDPOINT/region.
 * Returns null when unconfigured, so /api/data/dump falls back to the local file.
 */
export function readB2DownloadConfig(env: NodeJS.ProcessEnv = process.env): B2Config | null {
  const { B2_ENDPOINT, B2_DOWNLOAD_BUCKET, B2_DOWNLOAD_KEY_ID, B2_DOWNLOAD_APP_KEY } = env;
  if (!B2_ENDPOINT || !B2_DOWNLOAD_BUCKET || !B2_DOWNLOAD_KEY_ID || !B2_DOWNLOAD_APP_KEY) {
    return null;
  }
  return {
    endpoint: B2_ENDPOINT,
    region: parseB2Region(B2_ENDPOINT),
    bucket: B2_DOWNLOAD_BUCKET,
    keyId: B2_DOWNLOAD_KEY_ID,
    appKey: B2_DOWNLOAD_APP_KEY,
  };
}

/** Public S3-style URL for an object in a public B2 bucket. */
export function downloadPublicUrl(config: B2Config, key: string): string {
  return `https://${config.bucket}.s3.${config.region}.backblazeb2.com/${key}`;
}

/** S3 client for a B2 config — caller destroys. */
export function b2Client(config: B2Config): S3Client {
  return new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: { accessKeyId: config.keyId, secretAccessKey: config.appKey },
  });
}

/**
 * Multipart upload from a stream (#731 disk removal): pg_dump pipes straight
 * to B2 with no local staging. Returns the Upload so the caller can abort on
 * upstream failure (an aborted multipart never becomes a visible object).
 */
export function createB2StreamUpload(
  client: S3Client,
  config: B2Config,
  key: string,
  body: Readable,
): Upload {
  // Smaller parts than the file path: TWO stream uploads run concurrently
  // (backup + public download) and buffered parts cost RAM on the shared web
  // instance — 25 MB x 4 x 2 = 200 MB peak vs 800 MB at the file setting.
  return new Upload({
    client,
    params: { Bucket: config.bucket, Key: key, Body: body },
    partSize: 25 * 1024 * 1024,
    queueSize: UPLOAD_QUEUE_SIZE,
  });
}
