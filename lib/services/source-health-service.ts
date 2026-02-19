import { desc, eq, sql } from 'drizzle-orm';
import { CATEGORIES } from '@/lib/data/categories';
import { getDb, isDbAvailable } from '@/lib/db';
import { sourceHealth } from '@/lib/db/schema';
import { HEALTH_THRESHOLDS } from '@/lib/methodology/scoring-config';
import type { SourceStatus } from '@/lib/types';
import type { SignalFetchResult } from './feed-fetcher';

export interface SourceHealthCheck {
  sourceId: string;
  sourceName: string;
  sourceType: string;
  category: string;
  status: SourceStatus;
  documentCount: number;
  expectedDocCount: number | null;
  errorMessage?: string;
  lastSuccessAt?: string;
  checkedAt: string;
}

export type OverallHealth = 'normal' | 'degraded' | 'critical';

export interface SourceHealthSummary {
  totalSources: number;
  healthySources: number;
  degradedSources: number;
  unavailableSources: number;
  silentSources: number;
  overallHealth: OverallHealth;
  dataAvailabilityScore: number;
  checkedAt: string;
}

/** Classify a single signal's status based on fetch result and history. */
export function classifySourceStatus(
  fetchResult: SignalFetchResult,
  consecutiveZeroChecks: number,
): SourceStatus {
  if (!fetchResult.success) return 'unavailable';
  if (fetchResult.documentCount === 0) {
    return consecutiveZeroChecks >= HEALTH_THRESHOLDS.silentCheckCount ? 'silent' : 'healthy';
  }
  return 'healthy';
}

/** Compute overall health summary from individual source checks. */
export function computeHealthSummary(checks: SourceHealthCheck[]): SourceHealthSummary {
  const total = checks.length;
  if (total === 0) {
    return {
      totalSources: 0,
      healthySources: 0,
      degradedSources: 0,
      unavailableSources: 0,
      silentSources: 0,
      overallHealth: 'normal',
      dataAvailabilityScore: 1,
      checkedAt: new Date().toISOString(),
    };
  }

  const healthy = checks.filter((c) => c.status === 'healthy').length;
  const degraded = checks.filter((c) => c.status === 'degraded').length;
  const unavailable = checks.filter((c) => c.status === 'unavailable').length;
  const silent = checks.filter((c) => c.status === 'silent').length;

  const unhealthyFraction = (unavailable + degraded + silent) / total;
  let overallHealth: OverallHealth = 'normal';
  if (unhealthyFraction >= HEALTH_THRESHOLDS.criticalSourceFraction) {
    overallHealth = 'critical';
  } else if (unhealthyFraction >= HEALTH_THRESHOLDS.degradedSourceFraction) {
    overallHealth = 'degraded';
  }

  const dataAvailabilityScore = total > 0 ? healthy / total : 1;

  return {
    totalSources: total,
    healthySources: healthy,
    degradedSources: degraded,
    unavailableSources: unavailable,
    silentSources: silent,
    overallHealth,
    dataAvailabilityScore: Math.round(dataAvailabilityScore * 100) / 100,
    checkedAt: new Date().toISOString(),
  };
}

/** Count consecutive zero-document checks for a source from recent history. */
async function getConsecutiveZeroChecks(db: ReturnType<typeof getDb>, sourceId: string) {
  const rows = await db
    .select({ documentCount: sourceHealth.documentCount })
    .from(sourceHealth)
    .where(eq(sourceHealth.sourceId, sourceId))
    .orderBy(desc(sourceHealth.checkedAt))
    .limit(HEALTH_THRESHOLDS.silentCheckCount);
  let count = 0;
  for (const row of rows) {
    if ((row.documentCount ?? 0) === 0) count++;
    else break;
  }
  return count;
}

/** Build health checks from signal fetch results and record to DB. */
export async function recordSourceHealthChecks(
  category: string,
  signalResults: SignalFetchResult[],
): Promise<SourceHealthCheck[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const now = new Date().toISOString();
  const checks: SourceHealthCheck[] = [];

  for (const result of signalResults) {
    const consecutiveZeros = await getConsecutiveZeroChecks(db, result.signalId);
    const status = classifySourceStatus(result, consecutiveZeros);

    const check: SourceHealthCheck = {
      sourceId: result.signalId,
      sourceName: result.signalName,
      sourceType: result.signalType,
      category,
      status,
      documentCount: result.documentCount,
      expectedDocCount: null,
      errorMessage: result.errorMessage,
      lastSuccessAt: result.success ? now : undefined,
      checkedAt: now,
    };
    checks.push(check);

    await db.insert(sourceHealth).values({
      sourceId: check.sourceId,
      sourceName: check.sourceName,
      sourceType: check.sourceType,
      category: check.category,
      status: check.status,
      documentCount: check.documentCount,
      errorMessage: check.errorMessage ?? null,
      lastSuccessAt: result.success ? new Date() : null,
      checkedAt: new Date(),
    });
  }

  return checks;
}

/** Load latest health check per source from the DB. */
export async function getLatestSourceHealth(): Promise<SourceHealthCheck[]> {
  if (!isDbAvailable()) return [];
  const db = getDb();
  const rows = await db.execute(sql`
    SELECT DISTINCT ON (source_id)
      source_id, source_name, source_type, category,
      status, document_count, expected_doc_count,
      error_message, last_success_at, checked_at
    FROM source_health
    ORDER BY source_id, checked_at DESC
  `);

  return rows.rows.map((r) => {
    const row = r as Record<string, unknown>;
    return {
      sourceId: row.source_id as string,
      sourceName: row.source_name as string,
      sourceType: row.source_type as string,
      category: row.category as string,
      status: row.status as SourceStatus,
      documentCount: Number(row.document_count ?? 0),
      expectedDocCount: row.expected_doc_count ? Number(row.expected_doc_count) : null,
      errorMessage: (row.error_message as string) ?? undefined,
      lastSuccessAt: row.last_success_at
        ? new Date(row.last_success_at as string).toISOString()
        : undefined,
      checkedAt: new Date(row.checked_at as string).toISOString(),
    };
  });
}

/** Get all canary source IDs from category definitions. */
export function getCanarySourceIds(): string[] {
  return CATEGORIES.flatMap((cat) =>
    cat.signals.filter((s) => s.health?.isCanary).map((s) => s.id),
  );
}
