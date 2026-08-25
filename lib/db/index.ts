import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema';
import { resolveDbSsl } from './ssl';

let pool: Pool | null = null;
let db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (db) return db;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // Explicit pool bounds (#778/#780): max matches the pg default we always
  // ran with (now deliberate, sized against the 100-connection instance
  // limit with headroom for the health pool + CLI); connectionTimeoutMillis
  // makes pool exhaustion a fast visible error instead of an unbounded
  // queue — waiters queuing behind saturated fan-outs is how the 2026-08-24
  // health-starvation incident stayed invisible.
  pool = new Pool({
    connectionString,
    ssl: resolveDbSsl(connectionString),
    max: 10,
    connectionTimeoutMillis: 30_000,
  });
  db = drizzle(pool, { schema });
  return db;
}

export function isDbAvailable(): boolean {
  return !!process.env.DATABASE_URL;
}

let healthPool: Pool | null = null;

/**
 * DB liveness probe on a DEDICATED single-connection pool. The shared pool's
 * 10 connections can all be held by multi-second retrieval queries (a cold
 * enumeration build fires its alias arms concurrently), which queued
 * /api/health/live's SELECT 1 past Render's 5s health budget and got healthy
 * instances evicted (incident 2026-08-24). Health must never wait behind
 * application queries; connectionTimeoutMillis keeps failure fast so the
 * probe answers 503 instead of hanging.
 */
export async function pingDb(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL environment variable is not set');
  if (!healthPool) {
    healthPool = new Pool({
      connectionString,
      ssl: resolveDbSsl(connectionString),
      max: 1,
      connectionTimeoutMillis: 4_000,
    });
  }
  await healthPool.query('SELECT 1');
}

export { schema };
