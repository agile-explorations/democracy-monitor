import Link from 'next/link';
import { useMemo } from 'react';
import { ConvergenceIndicator } from '@/components/ui/ConvergenceIndicator';
import { StatusPill } from '@/components/ui/StatusPill';
import type { CategorySummary } from '@/lib/hooks/useWeekOverview';
import type { StatusLevel } from '@/lib/types';
import type { ConvergenceStatus } from '@/lib/types/structural';

export interface WeekCategoryGridProps {
  summaries: CategorySummary[];
  weekOf: string;
}

const STATUS_SORT_ORDER: Record<string, number> = {
  ConfirmedConcern: 0,
  Divergent: 1,
  Elevated: 2,
  Stable: 3,
};

export function WeekCategoryGrid({ summaries, weekOf }: WeekCategoryGridProps) {
  const sorted = useMemo(
    () =>
      [...summaries].sort((a, b) => {
        const aOrder = STATUS_SORT_ORDER[a.convergenceStatus ?? 'Stable'] ?? 99;
        const bOrder = STATUS_SORT_ORDER[b.convergenceStatus ?? 'Stable'] ?? 99;
        return aOrder - bOrder;
      }),
    [summaries],
  );

  if (sorted.length === 0) {
    return <p className="text-sm text-dm-text-secondary">No category data for this week.</p>;
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {sorted.map((cat) => (
        <Link
          key={cat.category}
          href={`/category/${cat.category}?weekOf=${weekOf}`}
          className="rounded-lg border border-dm-border bg-dm-card p-4 hover:border-dm-accent/50 transition-colors"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-sm font-medium text-dm-text-primary truncate">{cat.title}</span>
            {cat.insufficientData ? (
              <span className="text-[10px] text-dm-muted px-1.5 py-0.5 rounded border border-dm-border whitespace-nowrap">
                No Data
              </span>
            ) : (
              <StatusPill level={cat.status as StatusLevel} />
            )}
          </div>
          <div className="flex items-center justify-between">
            <ConvergenceIndicator
              structural={cat.structuralElevated}
              ai={cat.aiElevated}
              thematic={cat.thematicElevated}
            />
            <span className="text-[10px] text-dm-muted">
              {cat.convergenceStatus ? (cat.convergenceStatus as ConvergenceStatus) : '\u2014'}
            </span>
          </div>
        </Link>
      ))}
    </div>
  );
}
