import { eq } from 'drizzle-orm';
import {
  DIGEST_MAX_TOKENS,
  DIGEST_SYSTEM_PROMPT,
  buildDailyDigestPrompt,
} from '@/lib/ai/prompts/daily-digest';
import { getAvailableProviders } from '@/lib/ai/provider';
import { cacheGet, cacheSet } from '@/lib/cache';
import { CacheKeys } from '@/lib/cache/keys';
import { DIGEST_CACHE_TTL_S } from '@/lib/data/cache-config';
import { isDbAvailable, getDb } from '@/lib/db';
import { digests } from '@/lib/db/schema';
import type { DigestEntry, TrendAnomaly } from '@/lib/types/trends';
import { extractJsonFromLlm } from '@/lib/utils/ai-helpers';

type DigestRow = typeof digests.$inferSelect;

function mapRowToDigestEntry(row: DigestRow): DigestEntry {
  return {
    date: row.date,
    summary: row.summary,
    summaryExpert: row.summaryExpert || undefined,
    highlights: (row.highlights as string[]) || [],
    categorySummaries: (row.categorySummaries as Record<string, string>) || {},
    categorySummariesExpert: (row.categorySummariesExpert as Record<string, string>) || undefined,
    anomalies: [],
    overallAssessment: row.overallAssessment || '',
    provider: row.provider,
    model: row.model,
    createdAt: row.createdAt?.toISOString() ?? new Date().toISOString(),
  };
}

export async function generateDailyDigest(
  date: string,
  categoryData: Array<{
    category: string;
    status: string;
    reason: string;
    itemCount: number;
    highlights: string[];
  }>,
  anomalies: TrendAnomaly[] = [],
): Promise<DigestEntry | null> {
  const cacheKey = CacheKeys.digest(date);
  const cached = await cacheGet<DigestEntry>(cacheKey);
  if (cached) return cached;

  // Check DB for existing digest
  if (isDbAvailable()) {
    const db = getDb();
    const existing = await db.select().from(digests).where(eq(digests.date, date)).limit(1);

    if (existing.length > 0) {
      const digest = mapRowToDigestEntry(existing[0]);
      await cacheSet(cacheKey, digest, DIGEST_CACHE_TTL_S);
      return digest;
    }
  }

  const providers = getAvailableProviders();
  if (providers.length === 0) return null;

  const provider = providers.find((p) => p.name === 'anthropic') || providers[0];
  if (!provider) return null;

  const result = await provider.complete(buildDailyDigestPrompt(date, categoryData, anomalies), {
    systemPrompt: DIGEST_SYSTEM_PROMPT,
    maxTokens: DIGEST_MAX_TOKENS,
    temperature: 0.3,
  });

  interface DigestParsed {
    summary: string;
    summaryExpert?: string;
    highlights: string[];
    categorySummaries: Record<string, string>;
    categorySummariesExpert?: Record<string, string>;
    overallAssessment: string;
  }

  const parsed: DigestParsed = extractJsonFromLlm<DigestParsed>(result.content) || {
    summary: result.content.slice(0, 500),
    highlights: [],
    categorySummaries: {},
    overallAssessment: '',
  };

  const digest: DigestEntry = {
    date,
    summary: parsed.summary || '',
    summaryExpert: parsed.summaryExpert || undefined,
    highlights: parsed.highlights || [],
    categorySummaries: parsed.categorySummaries || {},
    categorySummariesExpert: parsed.categorySummariesExpert || undefined,
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
      summaryExpert: digest.summaryExpert,
      highlights: digest.highlights,
      categorySummaries: digest.categorySummaries,
      categorySummariesExpert: digest.categorySummariesExpert,
      overallAssessment: digest.overallAssessment,
      provider: digest.provider,
      model: digest.model,
    });
  }

  await cacheSet(cacheKey, digest, DIGEST_CACHE_TTL_S);
  return digest;
}

export async function getDigest(date: string): Promise<DigestEntry | null> {
  const cacheKey = CacheKeys.digest(date);
  const cached = await cacheGet<DigestEntry>(cacheKey);
  if (cached) return cached;

  if (!isDbAvailable()) return null;

  const db = getDb();
  const rows = await db.select().from(digests).where(eq(digests.date, date)).limit(1);

  if (rows.length === 0) return null;

  return mapRowToDigestEntry(rows[0]);
}
