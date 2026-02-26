import { and, eq } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { narratives } from '@/lib/db/schema';
import type { NarrativeResult, NarrativeVersion, StoredNarrative } from '@/lib/types';

/** Retrieve a stored narrative for a category/week/version. */
export async function getStoredNarrative(
  category: string,
  weekOf: string,
  version: NarrativeVersion,
): Promise<StoredNarrative | null> {
  const db = getDb();
  const rows = await db
    .select()
    .from(narratives)
    .where(
      and(
        eq(narratives.category, category),
        eq(narratives.weekOf, weekOf),
        eq(narratives.version, version),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    category: row.category,
    weekOf: row.weekOf,
    version: row.version as NarrativeVersion,
    content: row.content,
    model: row.model,
    generatedAt: row.generatedAt.toISOString(),
  };
}

/** Retrieve both narrative versions for a category/week. */
export async function getStoredNarratives(
  category: string,
  weekOf: string,
): Promise<{ expert: StoredNarrative | null; public: StoredNarrative | null }> {
  const [expert, pub] = await Promise.all([
    getStoredNarrative(category, weekOf, 'expert'),
    getStoredNarrative(category, weekOf, 'public'),
  ]);
  return { expert, public: pub };
}

/** Store a generated narrative result (both versions) in the database. */
export async function storeNarratives(
  category: string,
  weekOf: string,
  result: NarrativeResult,
): Promise<void> {
  const db = getDb();
  const rows = [
    { category, weekOf, version: 'expert' as const, content: result.expert, model: result.model },
    { category, weekOf, version: 'public' as const, content: result.public, model: result.model },
  ];

  for (const row of rows) {
    await db
      .insert(narratives)
      .values(row)
      .onConflictDoUpdate({
        target: [narratives.category, narratives.weekOf, narratives.version],
        set: { content: row.content, model: row.model },
      });
  }
}
