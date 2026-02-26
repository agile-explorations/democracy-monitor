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
 * Filter coverage statuses to those flagged as silent.
 * Pure function — no I/O.
 */
export function detectSilenceAlerts(coverage: SourceCoverageStatus[]): SourceCoverageStatus[] {
  return coverage.filter((s) => s.isSilent);
}
