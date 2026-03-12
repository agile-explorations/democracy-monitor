import { useMemo } from 'react';
import type { WeeklyRow } from '@/lib/hooks/useCategoryDetail';

export interface RangeSummaryPanelProps {
  weeklyData: WeeklyRow[];
  startIndex: number;
  endIndex: number;
}

export function RangeSummaryPanel({ weeklyData, startIndex, endIndex }: RangeSummaryPanelProps) {
  const rangeStats = useMemo(() => {
    const rangeRows = weeklyData.slice(startIndex, endIndex + 1);
    if (rangeRows.length === 0) return null;

    const rowsWithScore = rangeRows.filter((r) => r.convergenceScore != null);
    const avgScore =
      rowsWithScore.length > 0
        ? rowsWithScore.reduce((sum, r) => sum + (r.convergenceScore ?? 0), 0) /
          rowsWithScore.length
        : null;
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
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-lg border border-dm-border bg-dm-card p-4">
          <p className="text-[11px] uppercase tracking-wider text-dm-text-secondary mb-1">
            Avg Convergence
          </p>
          <p className="text-lg font-semibold text-dm-text-primary">
            {rangeStats.avgScore != null ? rangeStats.avgScore.toFixed(2) : '—'}
          </p>
          <p className="text-[10px] text-dm-muted mt-0.5">
            Stable (0) → Elevated (1) → Divergent (2) → Concern (3)
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
