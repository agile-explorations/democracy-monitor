/**
 * GET /api/data/dump-info — freshness metadata for the public database dump (#641).
 *
 * Returns the Last-Modified date + byte size of the artifact `/api/data/dump`
 * serves, so the Downloads & API page can show "Last updated: <date>". Source of
 * truth is the B2 download object's HEAD (the exact bytes users download, so it
 * can't drift from the local dump); falls back to the local file's `stat` when B2
 * isn't configured. Public, rate-limited, and CDN-cached (the dump changes weekly).
 */

import { existsSync, statSync } from 'fs';
import type { NextApiRequest, NextApiResponse } from 'next';
import {
  DOWNLOAD_OBJECT_KEY,
  downloadPublicUrl,
  readB2DownloadConfig,
} from '@/lib/services/b2-backup';
import { dumpInfoFromHeaders } from '@/lib/services/dump-info';
import type { DumpInfo } from '@/lib/services/dump-info';
import { requireMethod } from '@/lib/utils/api-helpers';
import { enforceRateLimit, RATE_LIMITS } from '@/lib/utils/rate-limit';

const DUMP_FILE = '/var/data/database.pgdump';
const HEAD_TIMEOUT_MS = 3000;
const CACHE_MAX_AGE_S = 3600; // dump changes weekly; an hour of shared cache is safe
const EMPTY: DumpInfo = { lastModified: null, sizeBytes: null };

/** Freshness from the public B2 object's HEAD, or null if unconfigured/unreachable. */
async function b2DumpInfo(): Promise<DumpInfo | null> {
  const dl = readB2DownloadConfig();
  if (!dl) return null;
  const url = downloadPublicUrl(dl, DOWNLOAD_OBJECT_KEY);
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), HEAD_TIMEOUT_MS);
    const res = await fetch(url, { method: 'HEAD', signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return dumpInfoFromHeaders(res.headers);
  } catch {
    // nosemgrep: opengrep.no-silent-catch — freshness is best-effort; a HEAD
    // failure falls back to the local stat and never breaks the page.
    return null;
  }
}

/** Freshness from the local dump file on the persistent disk, or null if absent. */
function localDumpInfo(): DumpInfo | null {
  if (!existsSync(DUMP_FILE)) return null;
  const stat = statSync(DUMP_FILE);
  return { lastModified: stat.mtime.toISOString(), sizeBytes: stat.size };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
  if (!requireMethod(req, res, 'GET')) return;
  if (!(await enforceRateLimit(req, res, RATE_LIMITS.dumpInfo))) return;

  const info = (await b2DumpInfo()) ?? localDumpInfo() ?? EMPTY;
  res.setHeader(
    'Cache-Control',
    `public, s-maxage=${CACHE_MAX_AGE_S}, stale-while-revalidate=86400`,
  );
  res.status(200).json(info);
}
