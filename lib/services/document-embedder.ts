import { eq, isNull, asc } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { embedBatch } from './embedding-service';

/**
 * Embed documents that haven't been processed yet.
 * No-op when DB or OpenAI embedding provider is unavailable.
 */
export async function embedUnprocessedDocuments(batchSize = 50): Promise<number> {
  if (!isDbAvailable()) return 0;

  const db = getDb();

  const unembedded = await db
    .select({ id: documents.id, title: documents.title, content: documents.content })
    .from(documents)
    .where(isNull(documents.embeddedAt))
    .orderBy(asc(documents.id))
    .limit(batchSize);

  if (unembedded.length === 0) return 0;

  const texts = unembedded.map((doc) => `${doc.title}${doc.content ? '\n' + doc.content : ''}`);

  const embeddings = await embedBatch(texts);

  let embedded = 0;
  const now = new Date();

  for (let i = 0; i < unembedded.length; i++) {
    const emb = embeddings[i];
    if (!emb) continue;

    try {
      await db
        .update(documents)
        .set({
          embedding: emb,
          embeddedAt: now,
        })
        .where(eq(documents.id, unembedded[i].id));

      embedded++;
    } catch (err) {
      console.error(`Failed to embed document ${unembedded[i].id}:`, err);
    }
  }

  return embedded;
}
