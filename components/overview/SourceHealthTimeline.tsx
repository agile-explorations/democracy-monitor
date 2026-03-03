import { useMemo, useState } from 'react';
import { CATEGORIES } from '@/lib/data/categories';
import { HEALTH_STRIP_COLORS } from '@/lib/data/chart-colors';
import type { FetchSourceDetail, FetchWeekHealth } from '@/lib/types/overview';
import { formatWeekLabel, formatWeekLabelWithYear } from '@/lib/utils/date-utils';

interface SourceHealthTimelineProps {
  data: FetchWeekHealth[];
  mode: 'light' | 'dark';
  brushStartIndex?: number;
  brushEndIndex?: number;
}

const CATEGORY_TITLE_MAP = new Map(CATEGORIES.map((c) => [c.key, c.title]));

const STATUS_ORDER: Record<string, number> = { failed: 0, partial: 1, complete: 2 };

function cellColor(week: FetchWeekHealth, mode: 'light' | 'dark'): string {
  const colors = HEALTH_STRIP_COLORS[mode];
  if (week.failed > 0) return colors.failed;
  if (week.partial > 0) return colors.partial;
  return colors.complete;
}

function statusColor(status: string, mode: 'light' | 'dark'): string {
  const colors = HEALTH_STRIP_COLORS[mode];
  if (status === 'failed') return colors.failed;
  if (status === 'partial') return colors.partial;
  return colors.complete;
}

function statusLabel(status: string): string {
  if (status === 'complete') return 'OK';
  if (status === 'partial') return 'Partial';
  return 'Failed';
}

function sortSourcesByStatus(sources: FetchSourceDetail[]): FetchSourceDetail[] {
  return [...sources].sort((a, b) => {
    const statusDiff = (STATUS_ORDER[a.status] ?? 2) - (STATUS_ORDER[b.status] ?? 2);
    if (statusDiff !== 0) return statusDiff;
    const catDiff = a.category.localeCompare(b.category);
    if (catDiff !== 0) return catDiff;
    return a.sourceOrigin.localeCompare(b.sourceOrigin);
  });
}

export function SourceHealthTimeline({
  data,
  mode,
  brushStartIndex,
  brushEndIndex,
}: SourceHealthTimelineProps) {
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);

  const visible =
    brushStartIndex != null && brushEndIndex != null
      ? data.slice(brushStartIndex, brushEndIndex + 1)
      : data;

  const stats = useMemo(() => {
    let total = 0;
    let complete = 0;
    let partial = 0;
    let failed = 0;
    for (const w of visible) {
      total += w.total;
      complete += w.complete;
      partial += w.partial;
      failed += w.failed;
    }
    return { total, complete, partial, failed };
  }, [visible]);

  const tickIndices = useMemo(() => {
    if (visible.length <= 1) return visible.length === 1 ? [0] : [];
    const ticks: number[] = [0];
    for (let i = 12; i < visible.length - 1; i += 12) {
      ticks.push(i);
    }
    ticks.push(visible.length - 1);
    return ticks;
  }, [visible]);

  const selected = visible.find((w) => w.week === selectedWeek) ?? null;

  if (data.length === 0) return null;

  const issues = stats.partial + stats.failed;

  return (
    <section>
      <h2 className="text-sm font-semibold text-dm-text-primary">Source Fetch Health</h2>
      <p className="text-[11px] text-dm-muted mt-0.5 mb-2">
        Per-week data collection reliability across all sources &mdash; click a week for detail
      </p>

      {/* Date labels above strip */}
      {visible.length > 1 && (
        <div className="relative text-[10px] text-dm-muted mb-[5px]" style={{ height: '1em' }}>
          {tickIndices.map((idx) => {
            const pct = (idx / (visible.length - 1)) * 100;
            const isLast = idx === visible.length - 1;
            return (
              <span
                key={idx}
                className="absolute whitespace-nowrap"
                style={{
                  left: `${pct}%`,
                  transform: isLast
                    ? 'translateX(-100%)'
                    : idx === 0
                      ? undefined
                      : 'translateX(-50%)',
                }}
              >
                {formatWeekLabel(visible[idx].week)}
              </span>
            );
          })}
        </div>
      )}

      {/* Clickable heatmap strip */}
      <div className="flex gap-px" role="group" aria-label="Source fetch health per week">
        {visible.map((week) => {
          const isSelected = week.week === selectedWeek;
          return (
            <button
              key={week.week}
              type="button"
              className="flex-1 h-7 rounded-sm min-w-[3px] transition-opacity"
              style={{
                backgroundColor: cellColor(week, mode),
                opacity: selectedWeek && !isSelected ? 0.4 : 1,
                outline: isSelected ? '2px solid currentColor' : 'none',
                outlineOffset: '1px',
              }}
              title={`Week of ${formatWeekLabelWithYear(week.week)}: ${week.complete}/${week.total} sources complete`}
              onClick={() => setSelectedWeek(isSelected ? null : week.week)}
            />
          );
        })}
      </div>

      {/* Summary stats */}
      <p className="mt-2 text-[11px] text-dm-text-secondary">
        {stats.complete.toLocaleString()}/{stats.total.toLocaleString()} source fetches complete
        <span className="text-dm-muted"> &middot; </span>
        {issues > 0 ? `${issues.toLocaleString()} issue${issues !== 1 ? 's' : ''}` : '0 issues'}
      </p>

      {/* Per-source detail panel for selected week */}
      {selected && (
        <WeekDetailPanel week={selected} mode={mode} onClose={() => setSelectedWeek(null)} />
      )}
    </section>
  );
}

function WeekDetailPanel({
  week,
  mode,
  onClose,
}: {
  week: FetchWeekHealth;
  mode: 'light' | 'dark';
  onClose: () => void;
}) {
  const sorted = week.sources ? sortSourcesByStatus(week.sources) : [];
  if (sorted.length === 0) return null;

  return (
    <div className="mt-2 text-[11px] border border-dm-border rounded overflow-hidden">
      <div className="px-2 py-1.5 bg-dm-card flex items-center justify-between">
        <span className="font-medium text-dm-text-primary">
          Week of {formatWeekLabel(week.week)}
        </span>
        <span className="flex items-center gap-2">
          <span className="text-dm-text-secondary">
            {week.complete}/{week.total} sources OK
            {week.partial > 0 && (
              <span style={{ color: HEALTH_STRIP_COLORS[mode].partial }}>
                {' '}
                &middot; {week.partial} partial
              </span>
            )}
            {week.failed > 0 && (
              <span style={{ color: HEALTH_STRIP_COLORS[mode].failed }}>
                {' '}
                &middot; {week.failed} failed
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-dm-muted hover:text-dm-text-primary transition-colors text-sm leading-none"
            aria-label="Close detail panel"
          >
            &times;
          </button>
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="text-dm-muted text-[10px] border-t border-dm-border">
            <th className="px-2 py-0.5 font-medium">Source</th>
            <th className="px-2 py-0.5 font-medium">Category</th>
            <th className="px-2 py-0.5 font-medium text-center">Status</th>
            <th className="px-2 py-0.5 font-medium text-right">Items</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((s) => (
            <SourceRow key={`${s.sourceOrigin}-${s.category}`} source={s} mode={mode} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SourceRow({ source, mode }: { source: FetchSourceDetail; mode: 'light' | 'dark' }) {
  const catTitle = CATEGORY_TITLE_MAP.get(source.category) ?? source.category;
  const errorText = source.errors && source.errors.length > 0 ? source.errors.join('; ') : null;

  return (
    <tr className="border-t border-dm-border/50">
      <td
        className="px-2 py-0.5 text-dm-text-primary truncate max-w-[180px]"
        title={source.sourceOrigin}
      >
        {source.sourceOrigin}
      </td>
      <td className="px-2 py-0.5 text-dm-text-secondary truncate max-w-[150px]" title={catTitle}>
        {catTitle}
      </td>
      <td className="px-2 py-0.5 text-center">
        <span
          className="inline-block px-1.5 py-px rounded text-[10px] font-medium"
          style={{
            color: statusColor(source.status, mode),
            backgroundColor: `${statusColor(source.status, mode)}18`,
          }}
        >
          {statusLabel(source.status)}
        </span>
      </td>
      <td className="px-2 py-0.5 text-right text-dm-text-secondary">
        {source.itemsFetched}
        {errorText && (
          <span
            className="ml-1 cursor-help"
            title={errorText}
            style={{ color: HEALTH_STRIP_COLORS[mode].failed }}
          >
            !
          </span>
        )}
      </td>
    </tr>
  );
}
