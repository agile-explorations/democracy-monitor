import type { DigestEntry, TrendAnomaly } from '@/lib/types/trends';
import { getAvailableProviders } from '@/lib/ai/provider';
import { DIGEST_SYSTEM_PROMPT, buildDailyDigestPrompt } from '@/lib/ai/prompts/daily-digest';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { isDbAvailable, getDb } from '@/lib/db';
import { digests } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';

export async function generateDailyDigest(
  date: string,
  categoryData: Array<{
    category: string;
    status: string;
    reason: string;
    itemCount: number;
    highlights: string[];
  }>,
  anomalies: TrendAnomaly[] = []
): Promise<DigestEntry | null> {
  const cacheKey = CacheKeys.digest(date);
  const cached = await cacheGet<DigestEntry>(cacheKey);
  if (cached) return cached;

  // Check DB for existing digest
  if (isDbAvailable()) {
    const db = getDb();
    const existing = await db.select()
      .from(digests)
      .where(eq(digests.date, date))
      .limit(1);

    if (existing.length > 0) {
      const entry = existing[0];
      const digest: DigestEntry = {
        date: entry.date,
        summary: entry.summary,
        highlights: (entry.highlights as string[]) || [],
        categorySummaries: (entry.categorySummaries as Record<string, string>) || {},
        anomalies: [],
        overallAssessment: entry.overallAssessment || '',
        provider: entry.provider,
        model: entry.model,
        createdAt: entry.createdAt?.toISOString() ?? new Date().toISOString(),
      };
      await cacheSet(cacheKey, digest, 24 * 60 * 60);
      return digest;
    }
  }

  const providers = getAvailableProviders();
  if (providers.length === 0) return null;

  const provider = providers.find(p => p.name === 'anthropic') || providers[0];

  const result = await provider.complete(
    buildDailyDigestPrompt(date, categoryData, anomalies),
    { systemPrompt: DIGEST_SYSTEM_PROMPT, maxTokens: 1000, temperature: 0.3 }
  );

  let parsed: {
    summary: string;
    highlights: string[];
    categorySummaries: Record<string, string>;
    overallAssessment: string;
  };

  try {
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(jsonMatch?.[0] || '{}');
  } catch {
    parsed = {
      summary: result.content.slice(0, 500),
      highlights: [],
      categorySummaries: {},
      overallAssessment: '',
    };
  }

  const digest: DigestEntry = {
    date,
    summary: parsed.summary || '',
    highlights: parsed.highlights || [],
    categorySummaries: parsed.categorySummaries || {},
    anomalies,
    overallAssessment: parsed.overallAssessment || '',
    provider: provider.name,
    model: result.model,
    createdAt: new Date().toISOString(),
  };

  // Store in DB
  if (isDbAvailable()) {
    const db = getDb();
    await db.insert(digests).values({
      date: digest.date,
      summary: digest.summary,
      highlights: digest.highlights,
      categorySummaries: digest.categorySummaries,
      overallAssessment: digest.overallAssessment,
      provider: digest.provider,
      model: digest.model,
    });
  }

  await cacheSet(cacheKey, digest, 24 * 60 * 60);
  return digest;
}

export async function getDigest(date: string): Promise<DigestEntry | null> {
  const cacheKey = CacheKeys.digest(date);
  const cached = await cacheGet<DigestEntry>(cacheKey);
  if (cached) return cached;

  if (!isDbAvailable()) return null;

  const db = getDb();
  const rows = await db.select()
    .from(digests)
    .where(eq(digests.date, date))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    date: row.date,
    summary: row.summary,
    highlights: (row.highlights as string[]) || [],
    categorySummaries: (row.categorySummaries as Record<string, string>) || {},
    anomalies: [],
    overallAssessment: row.overallAssessment || '',
    provider: row.provider,
    model: row.model,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}
