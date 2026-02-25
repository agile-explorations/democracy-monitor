import { useTheme } from '@/lib/contexts/ThemeContext';
import { CONVERGENCE_STATUS_COLORS } from '@/lib/data/chart-colors';
import type { ConvergenceStatus } from '@/lib/types';

export interface OverviewStatusSummaryProps {
  statusCounts: Record<ConvergenceStatus, number>;
}

const STATUS_ORDER: ConvergenceStatus[] = ['Stable', 'Elevated', 'Divergent', 'ConfirmedConcern'];

const STATUS_LABELS: Record<ConvergenceStatus, string> = {
  Stable: 'Stable',
  Elevated: 'Elevated',
  Divergent: 'Divergent',
  ConfirmedConcern: 'Confirmed Concern',
};

export function OverviewStatusSummary({ statusCounts }: OverviewStatusSummaryProps) {
  const { resolvedMode } = useTheme();
  const colors = CONVERGENCE_STATUS_COLORS[resolvedMode];

  return (
    <div
      className="flex flex-wrap items-center gap-3"
      role="group"
      aria-label="Status distribution"
    >
      {STATUS_ORDER.map((status) => {
        const count = statusCounts[status] ?? 0;
        if (count === 0) return null;
        return (
          <span
            key={status}
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium"
            style={{
              backgroundColor: colors[status] + '1a',
              color: colors[status],
            }}
          >
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: colors[status] }}
            />
            {count} {STATUS_LABELS[status]}
          </span>
        );
      })}
    </div>
  );
}
