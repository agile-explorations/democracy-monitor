import { CANARY_CRITICAL_FRACTION, INTEGRITY_THRESHOLDS } from '@/lib/methodology/scoring-config';
import { getCanarySourceIds } from './source-health-service';
import type { SourceHealthCheck, SourceHealthSummary } from './source-health-service';

export type DataIntegrity = 'high' | 'moderate' | 'low' | 'critical';
export type CanaryStatus = 'all_ok' | 'some_silent' | 'critical_silent';

export interface MetaAssessment {
  dataIntegrity: DataIntegrity;
  integrityScore: number;
  sourceAvailability: number;
  canaryStatus: CanaryStatus;
  summary: string;
  alerts: string[];
  checkedAt: string;
}

/** Classify canary source status from health checks. */
export function classifyCanaryStatus(checks: SourceHealthCheck[]): CanaryStatus {
  const canaryIds = new Set(getCanarySourceIds());
  const canaryChecks = checks.filter((c) => canaryIds.has(c.sourceId));
  if (canaryChecks.length === 0) return 'all_ok';

  const unhealthy = canaryChecks.filter((c) => c.status === 'unavailable' || c.status === 'silent');
  if (unhealthy.length === 0) return 'all_ok';

  const unhealthyFraction = unhealthy.length / canaryChecks.length;
  return unhealthyFraction >= CANARY_CRITICAL_FRACTION ? 'critical_silent' : 'some_silent';
}

/** Map an integrity score (0–1) to a data integrity level. */
export function classifyDataIntegrity(score: number): DataIntegrity {
  if (score >= INTEGRITY_THRESHOLDS.high) return 'high';
  if (score >= INTEGRITY_THRESHOLDS.moderate) return 'moderate';
  if (score >= INTEGRITY_THRESHOLDS.low) return 'low';
  return 'critical';
}

/** Build human-readable summary for a meta-assessment. */
export function buildMetaSummary(integrity: DataIntegrity, summary: SourceHealthSummary): string {
  if (integrity === 'high') {
    return 'All data sources operating normally.';
  }
  if (integrity === 'moderate') {
    return (
      `Some sources responding with reduced availability. ` +
      `${summary.healthySources} of ${summary.totalSources} sources healthy.`
    );
  }
  if (integrity === 'low') {
    return (
      `Multiple data sources unavailable or silent. ` +
      `${summary.healthySources} of ${summary.totalSources} sources healthy. ` +
      `Assessments based on incomplete data.`
    );
  }
  return (
    `Data sources critically degraded. ` +
    `${summary.healthySources} of ${summary.totalSources} sources healthy. ` +
    `Assessments should NOT be treated as reliable.`
  );
}

/** Build alert messages from source health checks. */
export function buildAlerts(checks: SourceHealthCheck[]): string[] {
  const alerts: string[] = [];
  for (const check of checks) {
    if (check.status === 'unavailable') {
      alerts.push(
        `${check.sourceName} is unavailable${check.errorMessage ? `: ${check.errorMessage}` : ''}`,
      );
    } else if (check.status === 'silent') {
      alerts.push(`${check.sourceName} is silent — no documents in recent checks`);
    }
  }
  return alerts;
}

/** Compute meta-assessment from source health data. */
export function computeMetaAssessment(
  healthSummary: SourceHealthSummary,
  checks: SourceHealthCheck[],
): MetaAssessment {
  const score = healthSummary.dataAvailabilityScore;
  const integrity = classifyDataIntegrity(score);
  const canary = classifyCanaryStatus(checks);

  // Downgrade integrity if canary sources are critical
  const effectiveIntegrity =
    canary === 'critical_silent' && integrity === 'high' ? 'moderate' : integrity;

  return {
    dataIntegrity: effectiveIntegrity,
    integrityScore: score,
    sourceAvailability: score,
    canaryStatus: canary,
    summary: buildMetaSummary(effectiveIntegrity, healthSummary),
    alerts: buildAlerts(checks),
    checkedAt: healthSummary.checkedAt,
  };
}
