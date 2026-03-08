/** Persistence for narrative generation failures — tracks what failed and enables retry. */

import { and, eq, isNull, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { narrativeFailures } from '@/lib/db/schema';
import type { NarrativeFailure } from '@/lib/types';

/** Record a narrative generation failure (upserts — latest failure wins). */
export async function recordFailure(
  category: string,
  weekOf: string,
  failedPass: number,
  error: string,
): Promise<void> {
  if (!isDbAvailable()) return;
  const db = getDb();

  await db
    .insert(narrativeFailures)
    .values({ category, weekOf, failedPass, error, attempts: 1 })
    .onConflictDoUpdate({
      target: [narrativeFailures.category, narrativeFailures.weekOf],
      set: {
        failedPass,
        error,
        attempts: sql`${narrativeFailures.attempts} + 1`,
        resolvedAt: sql`NULL`,
      },
    });
}

/** Mark a failure as resolved (narrative successfully generated on retry). */
export async function resolveFailure(category: string, weekOf: string): Promise<void> {
  if (!isDbAvailable()) return;
  const db = getDb();

  await db
    .update(narrativeFailures)
    .set({ resolvedAt: sql`NOW()` })
    .where(and(eq(narrativeFailures.category, category), eq(narrativeFailures.weekOf, weekOf)));
}

/** Get all unresolved failures (for retry CLI). */
export async function getUnresolvedFailures(
  categoryFilter?: string,
  weekFilter?: string,
): Promise<NarrativeFailure[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();

  const conditions = [isNull(narrativeFailures.resolvedAt)];
  if (categoryFilter) conditions.push(eq(narrativeFailures.category, categoryFilter));
  if (weekFilter) conditions.push(eq(narrativeFailures.weekOf, weekFilter));

  const rows = await db
    .select()
    .from(narrativeFailures)
    .where(and(...conditions))
    .orderBy(narrativeFailures.weekOf, narrativeFailures.category);

  return rows.map((r) => ({
    id: r.id,
    category: r.category,
    weekOf: r.weekOf,
    failedPass: r.failedPass,
    error: r.error,
    attempts: r.attempts,
    createdAt: r.createdAt.toISOString(),
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
  }));
}

/** Check if a category-week has an unresolved failure. */
export async function hasUnresolvedFailure(category: string, weekOf: string): Promise<boolean> {
  if (!isDbAvailable()) return false;
  const db = getDb();

  const rows = await db
    .select({ id: narrativeFailures.id })
    .from(narrativeFailures)
    .where(
      and(
        eq(narrativeFailures.category, category),
        eq(narrativeFailures.weekOf, weekOf),
        isNull(narrativeFailures.resolvedAt),
      ),
    )
    .limit(1);

  return rows.length > 0;
}
