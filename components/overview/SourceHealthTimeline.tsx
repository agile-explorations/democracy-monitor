import { useMemo, useState } from 'react';
import { HEALTH_STRIP_COLORS } from '@/lib/data/chart-colors';
import type { FetchWeekHealth } from '@/lib/types/overview';
import { formatWeekLabel } from '@/lib/utils/date-utils';

interface SourceHealthTimelineProps {
  data: FetchWeekHealth[];
  mode: 'light' | 'dark';
  brushStartIndex?: number;
  brushEndIndex?: number;
}

function cellColor(week: FetchWeekHealth, mode: 'light' | 'dark'): string {
  const colors = HEALTH_STRIP_COLORS[mode];
  if (week.failed > 0) return colors.failed;
  if (week.partial > 0) return colors.partial;
  return colors.complete;
}

function cellTooltip(week: FetchWeekHealth): string {
  return `Week of ${formatWeekLabel(week.week)}: ${week.complete}/${week.total} complete, ${week.partial} partial, ${week.failed} failed`;
}

export function SourceHealthTimeline({
  data,
  mode,
  brushStartIndex,
  brushEndIndex,
}: SourceHealthTimelineProps) {
  const [expanded, setExpanded] = useState(false);

  // Filter to brush range if provided
  const visible =
    brushStartIndex != null && brushEndIndex != null
      ? data.slice(brushStartIndex, brushEndIndex + 1)
      : data;

  // Global stats across visible range
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

  // Compute date tick indices every 12 weeks, always including first and last
  const tickIndices = useMemo(() => {
    if (visible.length <= 1) return visible.length === 1 ? [0] : [];
    const ticks: number[] = [0];
    for (let i = 12; i < visible.length - 1; i += 12) {
      ticks.push(i);
    }
    ticks.push(visible.length - 1);
    return ticks;
  }, [visible]);

  if (data.length === 0) return null;

  const issues = stats.partial + stats.failed;

  return (
    <section>
      <h2 className="text-sm font-semibold text-dm-text-primary">Source Fetch Health</h2>
      <p className="text-[11px] text-dm-muted mt-0.5 mb-2">
        Per-week data collection reliability across all sources
      </p>

      {/* Date labels above strip at 12-week intervals */}
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

      {/* Heatmap strip */}
      <div className="flex gap-px" role="img" aria-label="Source fetch health per week">
        {visible.map((week) => (
          <div
            key={week.week}
            className="flex-1 h-7 rounded-sm min-w-[3px]"
            style={{ backgroundColor: cellColor(week, mode) }}
            title={cellTooltip(week)}
          />
        ))}
      </div>

      {/* Global stats summary — always expandable */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="mt-2 flex items-center gap-1 text-[11px] text-dm-text-secondary hover:text-dm-text-primary transition-colors"
      >
        <span>
          {stats.complete.toLocaleString()}/{stats.total.toLocaleString()} fetches complete
        </span>
        <span className="text-dm-muted">&middot;</span>
        <span>
          {issues > 0 ? `${issues.toLocaleString()} issue${issues !== 1 ? 's' : ''}` : '0 issues'}
        </span>
        <span className="text-dm-muted text-[10px]">{expanded ? '\u25B2' : '\u25BC'}</span>
      </button>

      {/* Expanded detail table */}
      {expanded && (
        <div className="mt-2 text-[11px] border border-dm-border rounded overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="bg-dm-card text-dm-text-secondary">
                <th className="px-2 py-1 font-medium">Week</th>
                <th className="px-2 py-1 font-medium text-right">Complete</th>
                <th className="px-2 py-1 font-medium text-right">Partial</th>
                <th className="px-2 py-1 font-medium text-right">Failed</th>
                <th className="px-2 py-1 font-medium text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((w) => (
                <tr key={w.week} className="border-t border-dm-border">
                  <td className="px-2 py-1 text-dm-text-primary">{formatWeekLabel(w.week)}</td>
                  <td className="px-2 py-1 text-right text-dm-text-secondary">{w.complete}</td>
                  <td
                    className="px-2 py-1 text-right"
                    style={{
                      color: w.partial > 0 ? HEALTH_STRIP_COLORS[mode].partial : undefined,
                    }}
                  >
                    {w.partial}
                  </td>
                  <td
                    className="px-2 py-1 text-right"
                    style={{
                      color: w.failed > 0 ? HEALTH_STRIP_COLORS[mode].failed : undefined,
                    }}
                  >
                    {w.failed}
                  </td>
                  <td className="px-2 py-1 text-right text-dm-text-secondary">{w.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
