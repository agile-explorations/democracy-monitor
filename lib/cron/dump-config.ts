/** Shared dump-run staleness threshold (#731 diskless dumps): the runner
 *  heartbeats its dump_runs row every 30s while streaming; a 'running' row
 *  whose heartbeat is older than this means the runner died (instance
 *  recycled mid-dump) — the status endpoint reports it 'stale' and the next
 *  trigger reclaims it (#639). Generous: multipart part uploads can stall
 *  minutes on B2 hiccups without the process being dead. */
export const DUMP_HEARTBEAT_STALE_MS = 10 * 60 * 1000;
