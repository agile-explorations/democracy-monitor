import { useMemo } from 'react';
import { ConvergenceHeader } from '@/components/category/ConvergenceHeader';
import type { WeeklyRow } from '@/lib/hooks/useCategoryDetail';
import type { ConvergenceSynthesis } from '@/lib/types/structural';

export interface RangeSummaryPanelProps {
  weeklyData: WeeklyRow[];
  startIndex: number;
  endIndex: number;
  baseline: { avg: number; stddev: number };
  latestConvergence: ConvergenceSynthesis | null;
}

function formatRatio(value: number, baseline: number): string {
  if (baseline <= 0) return 'No baseline';
  const ratio = value / baseline;
  if (ratio < 1.05 && ratio > 0.95) return 'Within baseline';
  return `${ratio.toFixed(1)}\u00d7 baseline`;
}

export function RangeSummaryPanel({
  weeklyData,
  startIndex,
  endIndex,
  baseline,
  latestConvergence,
}: RangeSummaryPanelProps) {
  const rangeStats = useMemo(() => {
    const rangeRows = weeklyData.slice(startIndex, endIndex + 1);
    if (rangeRows.length === 0) return null;

    const avgScore =
      rangeRows.reduce((sum, r) => sum + Number(r.totalSeverity), 0) / rangeRows.length;
    const avgDocs =
      rangeRows.reduce((sum, r) => sum + Number(r.documentCount), 0) / rangeRows.length;
    const totalDocs = rangeRows.reduce((sum, r) => sum + Number(r.documentCount), 0);

    return {
      weekCount: rangeRows.length,
      avgScore,
      avgDocs,
      totalDocs,
    };
  }, [weeklyData, startIndex, endIndex]);

  if (!rangeStats) return null;

  return (
    <div className="space-y-4">
      <ConvergenceHeader synthesis={latestConvergence} />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-dm-border bg-dm-card p-4">
          <p className="text-[11px] uppercase tracking-wider text-dm-text-secondary mb-1">
            Avg Score
          </p>
          <p className="text-lg font-semibold text-dm-text-primary">
            {rangeStats.avgScore.toFixed(1)}
          </p>
          <p className="text-[10px] text-dm-muted mt-0.5">
            {formatRatio(rangeStats.avgScore, baseline.avg)}
          </p>
        </div>

        <div className="rounded-lg border border-dm-border bg-dm-card p-4">
          <p className="text-[11px] uppercase tracking-wider text-dm-text-secondary mb-1">
            Avg Docs/Week
          </p>
          <p className="text-lg font-semibold text-dm-text-primary">
            {rangeStats.avgDocs.toFixed(0)}
          </p>
        </div>

        <div className="rounded-lg border border-dm-border bg-dm-card p-4">
          <p className="text-[11px] uppercase tracking-wider text-dm-text-secondary mb-1">
            Total Docs
          </p>
          <p className="text-lg font-semibold text-dm-text-primary">{rangeStats.totalDocs}</p>
        </div>

        <div className="rounded-lg border border-dm-border bg-dm-card p-4">
          <p className="text-[11px] uppercase tracking-wider text-dm-text-secondary mb-1">
            Weeks in Range
          </p>
          <p className="text-lg font-semibold text-dm-text-primary">{rangeStats.weekCount}</p>
        </div>
      </div>
    </div>
  );
}
