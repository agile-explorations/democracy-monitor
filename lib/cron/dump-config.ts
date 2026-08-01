/**
 * A live `pg_dump` writes to `database.pgdump.tmp` continuously, so an idle temp
 * (mtime not advanced) for this long means the dump process died — e.g. the
 * instance was recycled mid-dump. Past this threshold the temp is treated as an
 * abandoned orphan: the status endpoint reports `stale`, and a new dump trigger
 * reclaims it instead of 409-ing forever. Comfortably above pg_dump's continuous
 * write cadence, well below any real dump duration. (#639 — crashed dump must
 * not block the weekly cron indefinitely.)
 */
export const STALE_TEMP_MS = 15 * 60_000;

/** True when the dump temp's last write is old enough that its writer is dead. */
export function isDumpTempStale(mtimeMs: number, nowMs: number = Date.now()): boolean {
  return nowMs - mtimeMs > STALE_TEMP_MS;
}
