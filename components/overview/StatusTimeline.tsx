import { useMemo } from 'react';
import { CONVERGENCE_STATUS_COLORS } from '@/lib/data/chart-colors';
import type { ConvergenceStatus } from '@/lib/types';
import type { StatusTimelineEntry } from '@/lib/types/overview';
import { formatWeekLabel } from '@/lib/utils/date-utils';

export interface StatusTimelineProps {
  entries: StatusTimelineEntry[];
  mode: 'light' | 'dark';
  onCellClick?: (category: string, week: string) => void;
}

const STATUS_LABELS: Record<ConvergenceStatus, string> = {
  Stable: 'Stable',
  Elevated: 'Elevated',
  Divergent: 'Divergent',
  ConfirmedConcern: 'Confirmed Concern',
};

const LEGEND_ITEMS: Array<{ status: ConvergenceStatus; label: string }> = [
  { status: 'Stable', label: 'Stable' },
  { status: 'Elevated', label: 'Elevated' },
  { status: 'Divergent', label: 'Divergent' },
  { status: 'ConfirmedConcern', label: 'Confirmed Concern' },
];

function noDataBg(mode: 'light' | 'dark'): string {
  const bg = mode === 'dark' ? '%231e293b' : '%23f1f5f9';
  const stripe = mode === 'dark' ? '%23334155' : '%23e2e8f0';
  return `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='6' height='6'><rect width='6' height='6' fill='${bg}'/><path d='M0 6L6 0' stroke='${stripe}' stroke-width='1'/></svg>`)}")`;
}

function TimelineLegend({
  colors,
  mode,
}: {
  colors: Record<string, string>;
  mode: 'light' | 'dark';
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[11px] text-dm-text-secondary">
      {LEGEND_ITEMS.map(({ status, label }) => (
        <span key={status} className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: colors[status] }}
          />
          {label}
        </span>
      ))}
      <span className="flex items-center gap-1.5">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: noDataBg(mode) }} />
        No data
      </span>
    </div>
  );
}

export function StatusTimeline({ entries, mode, onCellClick }: StatusTimelineProps) {
  const colors = useMemo(() => CONVERGENCE_STATUS_COLORS[mode], [mode]);

  if (entries.length === 0) {
    return <p className="text-sm text-dm-text-secondary py-4">No timeline data available.</p>;
  }

  const weeks = entries[0].segments.map((s) => s.week);
  const labelInterval = Math.max(1, Math.ceil(weeks.length / 8));

  return (
    <div>
      <TimelineLegend colors={colors} mode={mode} />
      <div className="overflow-x-auto">
        <div
          className="grid gap-px min-w-[600px]"
          style={{
            gridTemplateColumns: `280px repeat(${weeks.length}, 1fr)`,
          }}
          role="table"
          aria-label="Status heatmap"
        >
          {/* Header row */}
          <div className="text-[10px] text-dm-muted font-medium px-1 py-1" role="columnheader" />
          {weeks.map((week, i) => (
            <div
              key={week}
              className="text-[10px] text-dm-muted text-center py-1"
              role="columnheader"
            >
              {i % labelInterval === 0 ? formatWeekLabel(week) : ''}
            </div>
          ))}

          {/* Rows */}
          {entries.map((entry) => (
            <TimelineRow
              key={entry.category}
              entry={entry}
              mode={mode}
              colors={colors}
              onCellClick={onCellClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({
  entry,
  mode,
  colors,
  onCellClick,
}: {
  entry: StatusTimelineEntry;
  mode: 'light' | 'dark';
  colors: Record<string, string>;
  onCellClick?: (category: string, week: string) => void;
}) {
  return (
    <>
      <div
        className="text-xs text-dm-text-secondary truncate pl-1 pr-3 py-1 flex items-center"
        role="rowheader"
        title={entry.title}
      >
        {entry.title}
      </div>
      {entry.segments.map((seg) => {
        const isNoData = seg.status === null;
        const statusLabel = seg.status ? STATUS_LABELS[seg.status] : 'No data';

        return (
          <div
            key={seg.week}
            className={`rounded-sm min-h-[24px]${onCellClick ? ' cursor-pointer hover:ring-1 hover:ring-dm-accent/50' : ''}`}
            style={
              isNoData ? { background: noDataBg(mode) } : { backgroundColor: colors[seg.status!] }
            }
            title={`${entry.title} \u2014 ${formatWeekLabel(seg.week)}: ${statusLabel}`}
            role="cell"
            onClick={onCellClick ? () => onCellClick(entry.category, seg.week) : undefined}
          />
        );
      })}
    </>
  );
}
