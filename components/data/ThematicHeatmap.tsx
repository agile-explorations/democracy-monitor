import Link from 'next/link';
import { useMemo, useState } from 'react';
import { keyToSlug } from '@/lib/data/category-slugs';
import { SEQUENTIAL_SCALE_COLORS, Z_SCORE_SCALE_COLORS } from '@/lib/data/chart-colors';
import { buildMarkersByWeek } from '@/lib/data/instrument-changes';
import type { ThematicHeatmapRow, ThematicMetric } from '@/lib/types/overview';
import { divergingZScoreColor, sequentialScaleColor } from '@/lib/utils/color';
import { formatWeekLabel } from '@/lib/utils/date-utils';
import { HeatmapTooltip } from './HeatmapTooltip';

export interface ThematicHeatmapProps {
  rows: ThematicHeatmapRow[];
  mode: 'light' | 'dark';
  onCellClick?: (category: string, week: string) => void;
}

const METRIC_OPTIONS: Array<{ key: ThematicMetric; label: string }> = [
  { key: 'zScore', label: 'z-Score' },
  { key: 'centroidDistance', label: 'Centroid Dist.' },
  { key: 'novelDocRate', label: 'Novel Doc Rate' },
  { key: 'varianceRatio', label: 'Variance Ratio' },
  { key: 'crossAdminDistance', label: 'Cross-Admin' },
];

const METRIC_FULL_LABELS: Record<ThematicMetric, string> = {
  zScore: 'z-Score',
  centroidDistance: 'Centroid Distance',
  novelDocRate: 'Novel Document Rate',
  varianceRatio: 'Variance Ratio',
  crossAdminDistance: 'Cross-Admin Distance',
};

const DISTANCE_METRICS = new Set<ThematicMetric>(['centroidDistance', 'crossAdminDistance']);

const METRIC_MAX: Record<Exclude<ThematicMetric, 'zScore'>, number> = {
  centroidDistance: 0.5,
  novelDocRate: 1,
  varianceRatio: 3,
  crossAdminDistance: 0.5,
};

type WeekData = ThematicHeatmapRow['weeks'][number];

function getMetricValue(week: WeekData, metric: ThematicMetric): number | null {
  return week[metric];
}

function getCellColor(
  value: number | null,
  metric: ThematicMetric,
  mode: 'light' | 'dark',
): string | null {
  if (value === null) return null;
  if (metric === 'zScore') return divergingZScoreColor(value, mode);
  return sequentialScaleColor(value, METRIC_MAX[metric], mode);
}

function noDataBg(mode: 'light' | 'dark'): string {
  const bg = mode === 'dark' ? '%231e293b' : '%23f1f5f9';
  const stripe = mode === 'dark' ? '%23334155' : '%23e2e8f0';
  return `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='6' height='6'><rect width='6' height='6' fill='${bg}'/><path d='M0 6L6 0' stroke='${stripe}' stroke-width='1'/></svg>`,
  )}")`;
}

function buildTooltip(title: string, weekLabel: string, week: WeekData): string {
  const lines = [`${title} \u2014 ${weekLabel}`];
  if (week.zScore !== null) lines.push(`z-Score: ${week.zScore.toFixed(2)}`);
  if (week.centroidDistance !== null) {
    lines.push(`Centroid Distance: ${week.centroidDistance.toFixed(4)}`);
  }
  if (week.novelDocRate !== null) {
    lines.push(`Novel Doc Rate: ${(week.novelDocRate * 100).toFixed(1)}%`);
  }
  if (week.varianceRatio !== null) lines.push(`Variance Ratio: ${week.varianceRatio.toFixed(3)}`);
  if (week.crossAdminDistance !== null) {
    lines.push(`Cross-Admin Distance: ${week.crossAdminDistance.toFixed(4)}`);
  }
  if (week.bootstrap) lines.push('(bootstrap period)');
  return lines.join('\n');
}

function MetricSelector({
  selected,
  onChange,
}: {
  selected: ThematicMetric;
  onChange: (m: ThematicMetric) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 mb-3" role="tablist" aria-label="Metric selector">
      {METRIC_OPTIONS.map(({ key, label }) => (
        <button
          key={key}
          role="tab"
          aria-selected={selected === key}
          onClick={() => onChange(key)}
          className={`px-2.5 py-1 text-[11px] font-medium rounded-full transition-colors ${
            selected === key
              ? 'bg-dm-accent text-white'
              : 'bg-dm-card text-dm-text-secondary hover:text-dm-text-primary border border-dm-border'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function GradientLegend({ mode, metric }: { mode: 'light' | 'dark'; metric: ThematicMetric }) {
  if (metric === 'zScore') {
    const colors = Z_SCORE_SCALE_COLORS[mode];
    return (
      <div className="flex items-center gap-2 mb-3 text-[11px] text-dm-text-secondary">
        <span>more stable than recent weeks</span>
        <div
          className="h-3 w-32 rounded-sm"
          style={{
            background: `linear-gradient(to right, ${colors.low}, ${colors.mid}, ${colors.high})`,
          }}
        />
        <span>shifting faster than recent weeks</span>
        <span className="ml-2 text-dm-muted">z-score −4 to +4</span>
        <BootstrapLegendItem mode={mode} />
      </div>
    );
  }

  const colors = SEQUENTIAL_SCALE_COLORS[mode];
  const max = METRIC_MAX[metric];
  const label = METRIC_FULL_LABELS[metric];
  return (
    <div className="flex items-center gap-2 mb-3 text-[11px] text-dm-text-secondary">
      <span>0</span>
      <div
        className="h-3 w-32 rounded-sm"
        style={{
          background: `linear-gradient(to right, ${colors.low}, ${colors.mid}, ${colors.high})`,
        }}
      />
      <span>{max}</span>
      <span className="ml-2 text-dm-muted">{label}</span>
      <BootstrapLegendItem mode={mode} />
      {DISTANCE_METRICS.has(metric) && (
        <span className="flex items-center gap-1 ml-3">
          <span
            className="inline-block w-3 h-3 rounded-sm bg-dm-text-secondary"
            style={{ opacity: 0.25 }}
          />
          Too few documents for a reliable distance
        </span>
      )}
    </div>
  );
}

function BootstrapLegendItem({ mode }: { mode: 'light' | 'dark' }) {
  return (
    <>
      <span className="flex items-center gap-1 ml-3">
        <span className="inline-block w-3 h-3 rounded-sm" style={{ background: noDataBg(mode) }} />
        No documents that week
      </span>
      <span className="flex items-center gap-1 ml-2">
        <span
          className="inline-block w-3 h-3 rounded-sm border border-dashed"
          style={{ borderColor: mode === 'dark' ? '#64748b' : '#94a3b8' }}
        />
        Bootstrap
      </span>
    </>
  );
}

export function ThematicHeatmap({ rows, mode, onCellClick }: ThematicHeatmapProps) {
  const [metric, setMetric] = useState<ThematicMetric>('zScore');

  const weeks = useMemo(() => {
    if (rows.length === 0 || rows[0].weeks.length === 0) return [];
    return rows[0].weeks.map((w) => w.week);
  }, [rows]);

  if (rows.length === 0) {
    return <p className="text-sm text-dm-text-secondary py-4">No thematic data available.</p>;
  }

  const labelInterval = Math.max(1, Math.ceil(weeks.length / 8));
  const markersByWeek = buildMarkersByWeek(weeks);

  return (
    <div>
      <MetricSelector selected={metric} onChange={setMetric} />
      <GradientLegend mode={mode} metric={metric} />
      <div className="overflow-x-auto">
        <div
          className="grid gap-px min-w-[600px]"
          style={{ gridTemplateColumns: `280px repeat(${weeks.length}, 1fr)` }}
          role="table"
          aria-label="Thematic drift heatmap"
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

          {/* Methodology-change markers (#580) — same treatment as the
              structural heatmap: regime shifts in our own ingest, marked so
              they aren't read as government behavior. */}
          {markersByWeek.size > 0 && (
            <>
              <div
                className="text-[9px] text-dm-muted uppercase tracking-wider px-1 pb-1 flex items-end"
                role="rowheader"
              >
                Methodology changes
              </div>
              {weeks.map((week) => {
                const changes = markersByWeek.get(week);
                return (
                  <div key={`marker-${week}`} className="text-center pb-1" role="cell">
                    {changes && (
                      <span
                        className="text-[9px] text-dm-accent cursor-help"
                        title={changes.map((c) => `Methodology change: ${c}`).join('\n')}
                        aria-label={`Methodology change in week of ${formatWeekLabel(week)}`}
                      >
                        ▲
                      </span>
                    )}
                  </div>
                );
              })}
            </>
          )}

          {/* Data rows */}
          {rows.map((row) => (
            <ThematicHeatmapRow
              key={row.category}
              row={row}
              mode={mode}
              metric={metric}
              onCellClick={onCellClick}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function ThematicHeatmapRow({
  row,
  mode,
  metric,
  onCellClick,
}: {
  row: ThematicHeatmapRow;
  mode: 'light' | 'dark';
  metric: ThematicMetric;
  onCellClick?: (category: string, week: string) => void;
}) {
  return (
    <>
      <div
        className="text-xs text-dm-text-secondary truncate pl-1 pr-3 py-1 flex items-center"
        role="rowheader"
        title={row.title}
      >
        <Link
          href={`/category/${keyToSlug(row.category)}`}
          className="hover:text-dm-accent transition-colors"
        >
          {row.title}
        </Link>
      </div>
      {row.weeks.map((week) => {
        const value = getMetricValue(week, metric);
        const color = getCellColor(value, metric, mode);
        const weekLabel = formatWeekLabel(week.week);
        // With very few docs the week centroid IS the docs, so distance
        // metrics read as drift on tiny weeks (#579) — dim them rather than
        // present arithmetic as politics.
        const masked = week.lowVolume && DISTANCE_METRICS.has(metric);
        const tooltip =
          buildTooltip(row.title, weekLabel, week) +
          (masked ? '\nToo few documents for a reliable distance' : '');
        const bootstrapBorder = week.bootstrap
          ? { border: `1px dashed ${mode === 'dark' ? '#64748b' : '#94a3b8'}` }
          : {};

        return (
          <HeatmapTooltip
            key={week.week}
            category={row.category}
            week={week.week}
            tooltipText={tooltip}
          >
            <div
              className={`rounded-sm min-h-[24px]${onCellClick ? ' cursor-pointer hover:ring-1 hover:ring-dm-accent/50' : ''}`}
              style={
                color === null
                  ? { background: noDataBg(mode), ...bootstrapBorder }
                  : {
                      backgroundColor: color,
                      ...(masked ? { opacity: 0.25 } : {}),
                      ...bootstrapBorder,
                    }
              }
              role="cell"
              onClick={onCellClick ? () => onCellClick(row.category, week.week) : undefined}
            />
          </HeatmapTooltip>
        );
      })}
    </>
  );
}
