import Link from 'next/link';
import { useMemo } from 'react';
import { keyToSlug } from '@/lib/data/category-slugs';
import { CONCERN_LEVEL_COLORS } from '@/lib/data/chart-colors';
import { buildMarkersByWeek } from '@/lib/data/instrument-changes';
import type { ConcernLevel } from '@/lib/types';
import type { StatusTimelineEntry } from '@/lib/types/overview';
import { formatWeekLabel } from '@/lib/utils/date-utils';

export interface StatusTimelineProps {
  entries: StatusTimelineEntry[];
  mode: 'light' | 'dark';
  onCellClick?: (category: string, week: string) => void;
  onWeekHeaderClick?: (week: string) => void;
  selectedWeek?: string | null;
  linkParams?: string;
}

const STATUS_LABELS: Record<string, string> = {
  Stable: 'Stable',
  Elevated: 'Elevated',
  ConfirmedConcern: 'Confirmed Concern',
};

const LEGEND_ITEMS: Array<{ status: ConcernLevel; label: string }> = [
  { status: 'Stable', label: 'Stable' },
  { status: 'Elevated', label: 'Elevated' },
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
  hasUnassessed,
}: {
  colors: Record<string, string>;
  mode: 'light' | 'dark';
  hasUnassessed: boolean;
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
      {/* Shown only when the rendered range actually contains such a cell —
          post-#567 that means an assessment is briefly pending, not missing. */}
      {hasUnassessed && (
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ background: noDataBg(mode) }}
          />
          Not yet assessed
        </span>
      )}
    </div>
  );
}

export function StatusTimeline({
  entries,
  mode,
  onCellClick,
  onWeekHeaderClick,
  selectedWeek,
  linkParams = '',
}: StatusTimelineProps) {
  const colors = useMemo(() => CONCERN_LEVEL_COLORS[mode], [mode]);

  if (entries.length === 0) {
    return <p className="text-sm text-dm-text-secondary py-4">No timeline data available.</p>;
  }

  const weeks = entries[0].segments.map((s) => s.week);
  const markersByWeek = buildMarkersByWeek(weeks);
  const labelInterval = Math.max(1, Math.ceil(weeks.length / 8));
  const hasUnassessed = entries.some((e) => e.segments.some((seg) => seg.status === null));

  return (
    <div>
      <TimelineLegend colors={colors} mode={mode} hasUnassessed={hasUnassessed} />
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
          {weeks.map((week, i) => {
            const isSelected = selectedWeek === week;
            const label = i % labelInterval === 0 ? formatWeekLabel(week) : '';
            return (
              <div
                key={week}
                className={`text-[10px] text-center pt-1 pb-0.5 flex flex-col items-center ${isSelected ? 'text-dm-accent font-semibold' : 'text-dm-muted'}${onWeekHeaderClick ? ' cursor-pointer hover:text-dm-accent transition-colors' : ''}`}
                role="columnheader"
                title={formatWeekLabel(week)}
                onClick={onWeekHeaderClick ? () => onWeekHeaderClick(week) : undefined}
              >
                {label && <span>{label}</span>}
                <span
                  className={`block w-full mt-auto rounded-sm ${isSelected ? 'h-1.5 bg-dm-accent' : 'h-1.5 border border-dm-muted/30'}${onWeekHeaderClick ? ' hover:border-dm-accent hover:bg-dm-accent/20' : ''}`}
                />
              </div>
            );
          })}

          {/* Methodology-change markers — same treatment as the data-page
              heatmaps: our own ingest regime shifts, marked so they aren't
              read as government behavior. */}
          {markersByWeek.size > 0 && (
            <>
              <div
                className="text-[9px] text-dm-muted uppercase tracking-wider px-1 pb-1 flex items-end"
                role="rowheader"
              >
                Collection changes
              </div>
              {weeks.map((week) => {
                const changes = markersByWeek.get(week);
                return (
                  <div key={`marker-${week}`} className="text-center pb-1" role="cell">
                    {changes && (
                      <span
                        className="text-[9px] text-dm-accent cursor-help"
                        title={changes.map((c) => `Data collection change: ${c}`).join('\n')}
                        aria-label={`Data collection change in week of ${formatWeekLabel(week)}`}
                      >
                        ▲
                      </span>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Rows */}
          {entries.map((entry) => (
            <TimelineRow
              key={entry.category}
              entry={entry}
              mode={mode}
              colors={colors}
              onCellClick={onCellClick}
              selectedWeek={selectedWeek}
              linkParams={linkParams}
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
  selectedWeek,
  linkParams,
}: {
  entry: StatusTimelineEntry;
  mode: 'light' | 'dark';
  colors: Record<string, string>;
  onCellClick?: (category: string, week: string) => void;
  selectedWeek?: string | null;
  linkParams?: string;
}) {
  return (
    <>
      <div
        className="text-xs text-dm-text-secondary truncate pl-1 pr-3 py-1 flex items-center"
        role="rowheader"
        title={entry.title}
      >
        <Link
          href={`/category/${keyToSlug(entry.category)}${linkParams}`}
          className="hover:text-dm-accent transition-colors"
        >
          {entry.title}
        </Link>
      </div>
      {entry.segments.map((seg) => {
        const isNoData = seg.status === null;
        const statusLabel = seg.status ? STATUS_LABELS[seg.status] : 'Not yet assessed';
        const isSelected = selectedWeek === seg.week;

        return (
          <div
            key={seg.week}
            className={`rounded-sm min-h-[24px]${isSelected ? ' ring-2 ring-dm-accent' : ''}${onCellClick ? ' cursor-pointer hover:ring-1 hover:ring-dm-accent/50' : ''}`}
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
