import { useMemo } from 'react';
import { CONVERGENCE_STATUS_COLORS } from '@/lib/data/chart-colors';
import type { ConvergenceStatus } from '@/lib/types';
import type { StatusTimelineEntry } from '@/lib/types/overview';
import { formatWeekLabel } from '@/lib/utils/date-utils';

export interface StatusTimelineProps {
  entries: StatusTimelineEntry[];
  mode: 'light' | 'dark';
}

const STATUS_LABELS: Record<ConvergenceStatus, string> = {
  Stable: 'Stable',
  Elevated: 'Elevated',
  Divergent: 'Divergent',
  ConfirmedConcern: 'Confirmed Concern',
};

export function StatusTimeline({ entries, mode }: StatusTimelineProps) {
  const colors = useMemo(() => CONVERGENCE_STATUS_COLORS[mode], [mode]);

  if (entries.length === 0) {
    return <p className="text-sm text-dm-text-secondary py-4">No timeline data available.</p>;
  }

  const weeks = entries[0].segments.map((s) => s.week);
  const labelInterval = Math.max(1, Math.ceil(weeks.length / 8));

  return (
    <div className="overflow-x-auto">
      <div
        className="grid gap-px min-w-[600px]"
        style={{
          gridTemplateColumns: `140px repeat(${weeks.length}, 1fr)`,
        }}
        role="table"
        aria-label="Status timeline"
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
          <TimelineRow key={entry.category} entry={entry} colors={colors} />
        ))}
      </div>
    </div>
  );
}

function TimelineRow({
  entry,
  colors,
}: {
  entry: StatusTimelineEntry;
  colors: Record<string, string>;
}) {
  return (
    <>
      <div
        className="text-xs text-dm-text-secondary truncate px-1 py-1 flex items-center"
        role="rowheader"
        title={entry.title}
      >
        {entry.title}
      </div>
      {entry.segments.map((seg) => (
        <div
          key={seg.week}
          className="rounded-sm min-h-[24px]"
          style={{ backgroundColor: colors[seg.status] }}
          title={`${entry.title} — ${formatWeekLabel(seg.week)}: ${STATUS_LABELS[seg.status]}`}
          role="cell"
        />
      ))}
    </>
  );
}
