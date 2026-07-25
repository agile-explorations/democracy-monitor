/**
 * Weekly digest send gate. Ingest failures can produce an internally
 * consistent but grossly wrong narrative (a collapsed source reads as a
 * falsely quiet week), so the digest only goes to subscribers when the run's
 * quality signals are clean. A held digest is released manually with
 * `pnpm digest:send --week <date>` after review.
 */

import type { DataIntegrity } from '@/lib/services/meta-assessment-service';

export interface DigestGateInput {
  /** Meta-assessment integrity from source health checks; null when the run collected none. */
  dataIntegrity: DataIntegrity | null;
  /** Error-severity validate:graph violations from this run. */
  graphErrorViolations: number;
  /** Weekly aggregate failures that survived the retry pass. */
  unresolvedAggregateFailures: number;
}

export interface DigestGateResult {
  send: boolean;
  holdReasons: string[];
}

export function evaluateDigestGate(input: DigestGateInput): DigestGateResult {
  const holdReasons: string[] = [];
  if (input.dataIntegrity === null) {
    holdReasons.push('no source health data collected this run');
  } else if (input.dataIntegrity === 'low' || input.dataIntegrity === 'critical') {
    holdReasons.push(
      `source data integrity is ${input.dataIntegrity} — narrative may reflect incomplete ingest`,
    );
  }
  if (input.graphErrorViolations > 0) {
    holdReasons.push(`${input.graphErrorViolations} error-severity derivation-graph violation(s)`);
  }
  if (input.unresolvedAggregateFailures > 0) {
    holdReasons.push(
      `${input.unresolvedAggregateFailures} weekly aggregate(s) failed to store after retry`,
    );
  }
  return { send: holdReasons.length === 0, holdReasons };
}
