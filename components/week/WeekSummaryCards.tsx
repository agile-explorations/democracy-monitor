export interface WeekSummaryCardsProps {
  totalScore: number;
  documentCount: number;
  captureCount: number;
  driftCount: number;
  warningCount: number;
  baselineAvg: number;
}

function StatCard({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dm-border bg-dm-card p-4">
      <p className="text-[11px] uppercase tracking-wider text-dm-text-secondary mb-1">{label}</p>
      <div className="text-lg font-semibold text-dm-text-primary">{children}</div>
    </div>
  );
}

function formatRatio(score: number, baseline: number): string {
  if (baseline <= 0) return 'No baseline';
  const ratio = score / baseline;
  if (ratio < 1.05 && ratio > 0.95) return 'Within baseline';
  return `${ratio.toFixed(1)}\u00d7 baseline`;
}

export function WeekSummaryCards({
  totalScore,
  documentCount,
  captureCount,
  driftCount,
  warningCount,
  baselineAvg,
}: WeekSummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <StatCard label="Total Score">{totalScore.toFixed(1)}</StatCard>
      <StatCard label="Documents Scored">{documentCount}</StatCard>
      <StatCard label="Severity Mix">
        <span className="text-sm">
          {captureCount}C &middot; {driftCount}D &middot; {warningCount}W
        </span>
      </StatCard>
      <StatCard label="vs. Baseline">{formatRatio(totalScore, baselineAvg)}</StatCard>
    </div>
  );
}
