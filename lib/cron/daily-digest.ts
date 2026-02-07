import { cacheGet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { CATEGORIES } from '@/lib/data/categories';
import { generateDailyDigest } from '@/lib/services/daily-digest-service';

export async function runDailyDigest(): Promise<void> {
  const date = new Date().toISOString().split('T')[0];
  console.log(`[daily-digest] Generating digest for ${date}...`);

  // Gather latest assessment data from cache
  const categoryData = await Promise.all(
    CATEGORIES.map(async (cat) => {
      const cached = await cacheGet<{
        status: string;
        reason: string;
        matches: string[];
        detail: { itemsReviewed: number };
      }>(CacheKeys.assessment(cat.key));

      return {
        category: cat.title,
        status: cached?.status || 'Warning',
        reason: cached?.reason || 'No recent assessment',
        itemCount: cached?.detail?.itemsReviewed || 0,
        highlights: cached?.matches?.slice(0, 3) || [],
      };
    }),
  );

  const digest = await generateDailyDigest(date, categoryData);

  if (digest) {
    console.log(`[daily-digest] Digest generated: ${digest.summary.slice(0, 100)}...`);
  } else {
    console.log('[daily-digest] No AI provider available, skipping digest generation');
  }
}

if (require.main === module) {
  runDailyDigest()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('[daily-digest] Fatal error:', err);
      process.exit(1);
    });
}
