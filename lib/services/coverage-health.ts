import { and, eq, gte, sql } from 'drizzle-orm';
import { getDb, isDbAvailable } from '@/lib/db';
import { documents } from '@/lib/db/schema';
import {
  SILENCE_ALERT_MULTIPLIER,
  SOURCE_EXPECTED_CADENCE_DAYS,
} from '@/lib/methodology/scoring-config';

export interface SourceCoverageStatus {
  sourceOrigin: string;
  category: string;
  docCountThisWeek: number;
  lastDocumentAt: string | null;
  daysSinceLastDoc: number;
  expectedCadenceDays: number;
  isSilent: boolean;
}

/**
 * Get per-source-origin document counts and last-seen dates for a category.
 */
export async function getSourceCoverage(category: string): Promise<SourceCoverageStatus[]> {
  if (!isDbAvailable()) return [];

  const db = getDb();
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

  const rows = await db
    .select({
      sourceOrigin: documents.sourceOrigin,
      docCount: sql<number>`count(*)::int`,
      lastDoc: sql<string>`max(${documents.publishedAt})`,
    })
    .from(documents)
    .where(and(eq(documents.category, category), gte(documents.publishedAt, oneWeekAgo)))
    .groupBy(documents.sourceOrigin);

  const now = Date.now();

  return rows
    .filter((r) => r.sourceOrigin != null)
    .map((r) => {
      const origin = r.sourceOrigin as string;
      const lastDocDate = r.lastDoc ? new Date(r.lastDoc) : null;
      const daysSince = lastDocDate
        ? (now - lastDocDate.getTime()) / (24 * 60 * 60 * 1000)
        : Infinity;
      const expectedCadence = SOURCE_EXPECTED_CADENCE_DAYS[origin] ?? 7;

      return {
        sourceOrigin: origin,
        category,
        docCountThisWeek: r.docCount,
        lastDocumentAt: lastDocDate ? lastDocDate.toISOString() : null,
        daysSinceLastDoc: Math.round(daysSince),
        expectedCadenceDays: expectedCadence,
        isSilent: daysSince > expectedCadence * SILENCE_ALERT_MULTIPLIER,
      };
    });
}

/**
 * Filter coverage statuses to those flagged as silent.
 * Pure function — no I/O.
 */
export function detectSilenceAlerts(coverage: SourceCoverageStatus[]): SourceCoverageStatus[] {
  return coverage.filter((s) => s.isSilent);
}
