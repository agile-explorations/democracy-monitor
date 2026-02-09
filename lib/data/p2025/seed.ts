import { sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { p2025Proposals } from '@/lib/db/schema';
import { embedText } from '@/lib/services/embedding-service';
import { SEED_PROPOSALS } from './seed-proposals';

/**
 * Insert seed proposals into the database. Skips existing rows (ON CONFLICT DO NOTHING).
 * Returns the number of proposals inserted.
 */
export async function seedP2025Proposals(): Promise<number> {
  if (!isDbAvailable()) {
    console.warn('[p2025-seed] Database not available, skipping seed');
    return 0;
  }

  const db = getDb();
  let inserted = 0;

  for (const proposal of SEED_PROPOSALS) {
    const result = await db
      .insert(p2025Proposals)
      .values({
        id: proposal.id,
        chapter: proposal.chapter,
        targetAgency: proposal.targetAgency,
        dashboardCategory: proposal.dashboardCategory,
        policyArea: proposal.policyArea,
        severity: proposal.severity,
        text: proposal.text,
        summary: proposal.summary,
        status: proposal.status,
      })
      .onConflictDoNothing({ target: p2025Proposals.id })
      .returning({ id: p2025Proposals.id });

    if (result.length > 0) inserted++;
  }

  console.log(`[p2025-seed] Inserted ${inserted} of ${SEED_PROPOSALS.length} proposals`);
  return inserted;
}

/**
 * Embed any proposals that don't yet have an embedding vector.
 * Returns the number of proposals embedded.
 */
export async function embedP2025Proposals(): Promise<number> {
  if (!isDbAvailable()) return 0;

  const db = getDb();

  const unembedded = await db
    .select({ id: p2025Proposals.id, text: p2025Proposals.text, summary: p2025Proposals.summary })
    .from(p2025Proposals)
    .where(sql`${p2025Proposals.embedding} IS NULL`);

  let embedded = 0;

  for (const proposal of unembedded) {
    const textToEmbed = `${proposal.summary}\n\n${proposal.text}`;
    const embedding = await embedText(textToEmbed);

    if (embedding) {
      await db
        .update(p2025Proposals)
        .set({ embedding, updatedAt: new Date() })
        .where(sql`${p2025Proposals.id} = ${proposal.id}`);
      embedded++;
    }
  }

  console.log(`[p2025-seed] Embedded ${embedded} of ${unembedded.length} proposals`);
  return embedded;
}
