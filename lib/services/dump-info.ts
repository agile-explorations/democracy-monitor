/**
 * Freshness metadata for the public database dump (#641).
 *
 * Pure helpers shared by the `/api/data/dump-info` endpoint (which parses a B2/S3
 * HEAD response) and the Downloads & API page (which formats the stamp). Kept out
 * of the API route so the parsing/formatting is unit-testable in isolation.
 */

export interface DumpInfo {
  /** ISO-8601 timestamp of the served artifact, or null when unknown. */
  lastModified: string | null;
  /** Byte size of the served artifact, or null when unknown. */
  sizeBytes: number | null;
}

/** Parse a B2/S3 HEAD response's headers into dump freshness metadata. */
export function dumpInfoFromHeaders(headers: Headers): DumpInfo {
  const lastModifiedRaw = headers.get('last-modified');
  const contentLength = headers.get('content-length');
  const parsed = lastModifiedRaw ? new Date(lastModifiedRaw) : null;
  return {
    lastModified: parsed && !Number.isNaN(parsed.getTime()) ? parsed.toISOString() : null,
    sizeBytes: contentLength && /^\d+$/.test(contentLength.trim()) ? Number(contentLength) : null,
  };
}

/** Human-readable size for a multi-MB dump artifact, e.g. "6.6 GB" or "850 MB". */
export function formatDumpSize(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  return `${Math.round(bytes / 1e6)} MB`;
}

/** Locale-stable calendar date for the freshness stamp, e.g. "August 1, 2026". */
export function formatDumpDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
