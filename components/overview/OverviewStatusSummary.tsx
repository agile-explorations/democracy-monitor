import { useMemo } from 'react';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { CONCERN_LEVEL_COLORS } from '@/lib/data/chart-colors';
import { CONCERN_LEVEL_LABELS } from '@/lib/data/concern-level-explanations';
import type { ConcernLevel } from '@/lib/types';

export interface OverviewStatusSummaryProps {
  statusCounts: Record<ConcernLevel, number>;
}

const STATUS_ORDER: ConcernLevel[] = ['Stable', 'Elevated', 'ConfirmedConcern'];

const STATUS_LABELS: Record<string, string> = CONCERN_LEVEL_LABELS;

/** Minimum visible width percentage for non-zero segments. */
const MIN_SEGMENT_PCT = 3;

export function OverviewStatusSummary({ statusCounts }: OverviewStatusSummaryProps) {
  const { resolvedMode } = useTheme();
  const colors = CONCERN_LEVEL_COLORS[resolvedMode];

  const { total, segments } = useMemo(() => {
    const t = STATUS_ORDER.reduce((sum, s) => sum + (statusCounts[s] ?? 0), 0);
    if (t === 0) {
      return { total: 0, segments: STATUS_ORDER.map((s) => ({ status: s, count: 0, pct: 0 })) };
    }

    // Compute raw percentages, then enforce minimum for non-zero segments
    const raw = STATUS_ORDER.map((s) => {
      const count = statusCounts[s] ?? 0;
      return { status: s, count, rawPct: (count / t) * 100 };
    });

    const nonZero = raw.filter((r) => r.count > 0);
    const boosted = nonZero.filter((r) => r.rawPct < MIN_SEGMENT_PCT);
    const boostTotal = boosted.reduce((sum, r) => sum + (MIN_SEGMENT_PCT - r.rawPct), 0);
    const unboosted = nonZero.filter((r) => r.rawPct >= MIN_SEGMENT_PCT);
    const unboostedTotal = unboosted.reduce((sum, r) => sum + r.rawPct, 0);

    return {
      total: t,
      segments: raw.map((r) => {
        if (r.count === 0) return { status: r.status, count: 0, pct: 0 };
        if (r.rawPct < MIN_SEGMENT_PCT)
          return { status: r.status, count: r.count, pct: MIN_SEGMENT_PCT };
        // Proportionally shrink unboosted segments to make room
        const shrinkFactor =
          unboostedTotal > 0 ? (unboostedTotal - boostTotal) / unboostedTotal : 1;
        return { status: r.status, count: r.count, pct: r.rawPct * shrinkFactor };
      }),
    };
  }, [statusCounts]);

  if (total === 0) {
    return <p className="text-sm text-dm-text-secondary py-2">No status data available.</p>;
  }

  return (
    <div role="group" aria-label="Status distribution">
      {/* Stacked bar */}
      <div className="flex h-7 rounded-md overflow-hidden border border-dm-border/50">
        {segments.map(({ status, count, pct }) => {
          if (count === 0) return null;
          return (
            <div
              key={status}
              className="flex items-center justify-center text-[10px] font-medium transition-all"
              style={{
                width: `${pct}%`,
                backgroundColor: colors[status],
                color: '#fff',
                minWidth: 0,
              }}
              title={`${STATUS_LABELS[status]}: ${count} (${((count / total) * 100).toFixed(1)}%)`}
            >
              {pct > 8 ? count : ''}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[11px] text-dm-text-secondary">
        {segments.map(({ status, count }) => (
          <span key={status} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2.5 h-2.5 rounded-sm"
              style={{ backgroundColor: colors[status] }}
            />
            {STATUS_LABELS[status]}: {count}
          </span>
        ))}
        <span className="text-dm-muted ml-auto">{total} total category-weeks</span>
      </div>
    </div>
  );
}
