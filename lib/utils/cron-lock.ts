import { eq, lt } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { cronLocks } from '@/lib/db/schema';

const STALE_LOCK_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Attempt to acquire a cron lock. Returns true if acquired, false if held.
 * Clears stale locks (>6hr) before attempting acquisition.
 */
export async function acquireLock(key: string, ttlMs: number = STALE_LOCK_MS): Promise<boolean> {
  if (!isDbAvailable()) return true; // No DB = no locking (dev mode)

  const db = getDb();
  const now = new Date();

  // Clear stale locks
  const staleResult = await db.delete(cronLocks).where(lt(cronLocks.expiresAt, now)).returning();
  if (staleResult.length > 0) {
    console.warn(`[cron-lock] Cleared ${staleResult.length} stale lock(s)`);
  }

  // Try to insert — ON CONFLICT DO NOTHING means we get 0 rows if lock exists
  const inserted = await db
    .insert(cronLocks)
    .values({
      lockKey: key,
      acquiredAt: now,
      expiresAt: new Date(now.getTime() + ttlMs),
      pid: process.pid,
    })
    .onConflictDoNothing()
    .returning();

  return inserted.length > 0;
}

/** Release a cron lock. */
export async function releaseLock(key: string): Promise<void> {
  if (!isDbAvailable()) return;
  const db = getDb();
  await db.delete(cronLocks).where(eq(cronLocks.lockKey, key));
}

/**
 * Run a function with a cron lock. Acquires before, releases after (even on error).
 * If the lock is already held, logs a warning and exits without running the function.
 */
export async function withCronLock(
  key: string,
  fn: () => Promise<void>,
  ttlMs?: number,
): Promise<boolean> {
  const acquired = await acquireLock(key, ttlMs);
  if (!acquired) {
    console.warn(`[cron-lock] Lock "${key}" is held by another process. Skipping.`);
    return false;
  }

  try {
    await fn();
  } finally {
    await releaseLock(key);
  }
  return true;
}
