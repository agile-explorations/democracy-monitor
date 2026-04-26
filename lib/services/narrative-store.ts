import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/lib/db';
import { narratives } from '@/lib/db/schema';
import type {
  EditorialRecord,
  MultiPassNarrativeResult,
  NarrativeResult,
  NarrativeVersion,
  StoredNarrative,
} from '@/lib/types';

const DRAFT_VERSIONS = ['expert_draft', 'public_draft', 'feedback'] as const;

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

/** Retrieve both final narrative versions for a category/week. */
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

/** Retrieve the full editorial record (drafts + feedback + finals) for a category/week. */
export async function getEditorialRecord(
  category: string,
  weekOf: string,
): Promise<EditorialRecord> {
  const db = getDb();
  const versions: NarrativeVersion[] = [
    'expert',
    'public',
    'expert_draft',
    'public_draft',
    'feedback',
  ];

  const rows = await db
    .select()
    .from(narratives)
    .where(
      and(
        eq(narratives.category, category),
        eq(narratives.weekOf, weekOf),
        inArray(narratives.version, versions),
      ),
    );

  const byVersion = new Map(rows.map((r) => [r.version, { content: r.content, model: r.model }]));
  return {
    expert: byVersion.get('expert')?.content ?? null,
    public: byVersion.get('public')?.content ?? null,
    expertDraft: byVersion.get('expert_draft')?.content ?? null,
    publicDraft: byVersion.get('public_draft')?.content ?? null,
    feedback: byVersion.get('feedback')?.content ?? null,
    draftModel: byVersion.get('expert_draft')?.model ?? null,
    feedbackModel: byVersion.get('feedback')?.model ?? null,
    finalModel: byVersion.get('expert')?.model ?? null,
  };
}

/** Store a simple narrative result (both versions) — used for weekly/term summaries. */
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
        set: { content: row.content, model: row.model, generatedAt: sql`now()` },
      });
  }
}

/**
 * Delete orphan multi-pass artifacts (expert_draft / public_draft / feedback) for a
 * (category, weekOf). Use when a category drops from elevated to stable so prior
 * 3-pass rows don't linger as stale data.
 */
export async function deleteNarrativeDrafts(category: string, weekOf: string): Promise<void> {
  const db = getDb();
  await db
    .delete(narratives)
    .where(
      and(
        eq(narratives.category, category),
        eq(narratives.weekOf, weekOf),
        inArray(narratives.version, DRAFT_VERSIONS as unknown as string[]),
      ),
    );
}

/** Store all 5 artifacts from a multi-pass narrative generation in a single transaction. */
export async function storeMultiPassNarratives(
  category: string,
  weekOf: string,
  result: MultiPassNarrativeResult,
): Promise<void> {
  const db = getDb();
  const rows: Array<{
    category: string;
    weekOf: string;
    version: string;
    content: string;
    model: string;
  }> = [
    {
      category,
      weekOf,
      version: 'expert_draft',
      content: result.expertDraft,
      model: result.draftModel,
    },
    {
      category,
      weekOf,
      version: 'public_draft',
      content: result.publicDraft,
      model: result.draftModel,
    },
    {
      category,
      weekOf,
      version: 'feedback',
      content: result.feedback,
      model: result.feedbackModel,
    },
    { category, weekOf, version: 'expert', content: result.expert, model: result.finalModel },
    { category, weekOf, version: 'public', content: result.public, model: result.finalModel },
  ];

  await db.transaction(async (tx) => {
    for (const row of rows) {
      await tx
        .insert(narratives)
        .values(row)
        .onConflictDoUpdate({
          target: [narratives.category, narratives.weekOf, narratives.version],
          set: { content: row.content, model: row.model, generatedAt: sql`now()` },
        });
    }
  });
}
