/**
 * TLS configuration for Postgres connections (#631).
 *
 * External Render Postgres endpoints (`*postgres.render.com`) present a
 * publicly-trusted certificate. We verify it EXPLICITLY here rather than relying
 * on the connection string's `sslmode`, because `node-postgres` is changing how
 * it interprets `sslmode=require`: today it is an alias for `verify-full` (full
 * cert + hostname verification), but in pg v9 / pg-connection-string v3 it
 * reverts to standard libpq semantics — encrypt but DO NOT verify. Passing an
 * explicit `ssl` option keeps certificate + hostname verification regardless of
 * that default change, so a routine `pg` upgrade can't silently downgrade the
 * external DB link to something MITM-able.
 *
 * Internal Render connections (private network, bare hostname) and local dev
 * (`localhost`) return `undefined`, which leaves TLS behavior to the connection
 * string — unchanged from before this helper existed.
 */
export function resolveDbSsl(connectionString: string): { rejectUnauthorized: true } | undefined {
  let host: string;
  try {
    host = new URL(connectionString).hostname;
  } catch {
    return undefined;
  }
  return /postgres\.render\.com$/.test(host) ? { rejectUnauthorized: true } : undefined;
}
