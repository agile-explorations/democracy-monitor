// @ts-expect-error @next/env ships with Next.js but lacks type declarations
import { loadEnvConfig } from '@next/env';
import { gte } from 'drizzle-orm';
import { isDbAvailable, getDb } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import { clusterDocuments } from '@/lib/services/semantic-clustering-service';

loadEnvConfig(process.cwd());

export async function runWeeklyClustering(): Promise<void> {
  console.log('[weekly-clustering] Starting semantic clustering...');

  if (!isDbAvailable()) {
    console.log('[weekly-clustering] Database not available, skipping');
    return;
  }

  const db = getDb();
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  // Fetch recent documents
  const recentDocs = await db.select().from(documents).where(gte(documents.fetchedAt, oneWeekAgo));

  if (recentDocs.length === 0) {
    console.log('[weekly-clustering] No documents from past week');
    return;
  }

  console.log(`[weekly-clustering] Clustering ${recentDocs.length} documents...`);

  const docsForClustering = recentDocs.map((doc) => ({
    text: doc.content || doc.title,
    category: doc.category,
    title: doc.title,
  }));

  const k = Math.min(5, Math.ceil(docsForClustering.length / 3));
  const clusters = await clusterDocuments(docsForClustering, k);

  console.log(`[weekly-clustering] Created ${clusters.length} clusters:`);
  for (const cluster of clusters) {
    console.log(`  - ${cluster.label}: ${cluster.documentCount} docs`);
  }
}

if (require.main === module) {
  runWeeklyClustering()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[weekly-clustering] Fatal error:', err);
      process.exit(1);
    });
}
