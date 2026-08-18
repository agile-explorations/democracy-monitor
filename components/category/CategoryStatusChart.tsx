import { useMemo } from 'react';
import type { ReactElement } from 'react';
import {
  Bar,
  Brush,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS, CONCERN_LEVEL_COLORS } from '@/lib/data/chart-colors';
import { CONCERN_LEVEL_LABELS } from '@/lib/data/concern-level-explanations';
import type { WeeklyRow } from '@/lib/hooks/useCategoryDetail';
import type { ConcernLevel } from '@/lib/types/structural';
import { formatWeekLabel, formatWeekLabelWithYear } from '@/lib/utils/date-utils';
import { movingAverage } from '@/lib/utils/math';

export interface CategoryStatusChartProps {
  data: WeeklyRow[];
  mode: 'light' | 'dark';
  brushStartIndex?: number;
  brushEndIndex?: number;
  onRangeChange: (start: number, end: number) => void;
  selectedWeek: string | null;
  onWeekClick: (week: string) => void;
}

const TREND_WINDOW = 4;

interface ChartPoint {
  week: string;
  convergenceScore: number | null;
  trend: number | null;
  documentCount: number;
  status: ConcernLevel | null;
  statusValue: number;
  statusFill: string;
  statusOpacity: number;
}

/** Fixed bar heights per status on the 0–2 score axis */
const STATUS_BAR_HEIGHT: Record<ConcernLevel, number> = {
  Stable: 0,
  Elevated: 1,
  Divergent: 1, // Legacy status — mapped to Elevated visually
  ConfirmedConcern: 2,
};

/** Y-axis tick labels: show status names instead of bare numbers */
const SCORE_TICK_LABELS: Record<number, string> = {
  0: 'Consistent',
  1: 'Notable',
  2: 'Sustained',
};

/** Stable shape renderer for status bars — avoids Cell+Brush index misalignment */
function StatusBarShape(props: unknown): ReactElement | null {
  const { x, y, width, height, payload } = props as {
    x: number;
    y: number;
    width: number;
    height: number;
    payload: ChartPoint;
  };
  if (!width || !height) return null;
  return (
    <rect
      x={x}
      y={y}
      width={width}
      height={height}
      rx={2}
      fill={payload.statusFill}
      opacity={payload.statusOpacity}
    />
  );
}

function StatusTooltip({
  active,
  payload,
  mode,
}: {
  active?: boolean;
  payload?: Array<{ payload: ChartPoint }>;
  mode: 'light' | 'dark';
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const statusColors = CONCERN_LEVEL_COLORS[mode];

  return (
    <div className="rounded-md border border-dm-border bg-dm-card px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-dm-text-primary">{formatWeekLabel(d.week)}</p>
      {d.status && (
        <p className="mt-1" style={{ color: statusColors[d.status] }}>
          {CONCERN_LEVEL_LABELS[d.status as ConcernLevel] ?? d.status}
        </p>
      )}
      {d.trend != null && (
        <p className="text-dm-text-secondary mt-1">
          Trend: <span className="font-medium text-dm-text-primary">{d.trend.toFixed(1)}</span>
        </p>
      )}
      <p className="text-dm-text-secondary">{d.documentCount} documents</p>
    </div>
  );
}

export function CategoryStatusChart({
  data,
  mode,
  brushStartIndex,
  brushEndIndex,
  onRangeChange,
  selectedWeek,
  onWeekClick,
}: CategoryStatusChartProps) {
  const colors = useMemo(() => CHART_COLORS[mode], [mode]);
  const statusColors = useMemo(() => CONCERN_LEVEL_COLORS[mode], [mode]);

  const startIdx = brushStartIndex ?? 0;
  const endIdx = brushEndIndex ?? data.length - 1;
  const rangeLabel = useMemo(() => {
    if (data.length === 0) return '';
    const startWeek = data[startIdx]?.weekOf;
    const endWeek = data[endIdx]?.weekOf;
    if (!startWeek || !endWeek) return '';
    return `${formatWeekLabelWithYear(startWeek)} \u2013 ${formatWeekLabelWithYear(endWeek)}`;
  }, [data, startIdx, endIdx]);

  const chartData: ChartPoint[] = useMemo(() => {
    // Map status to the 0-1-2 scale matching the Y axis (not layersElevated which maxes at 1)
    const statusScores = data.map((r) => {
      const s = r.convergenceDetail?.status;
      return s ? (STATUS_BAR_HEIGHT[s as ConcernLevel] ?? 0) : 0;
    });
    const smoothed = movingAverage(statusScores, TREND_WINDOW);

    return data.map((row, i) => {
      const status = row.convergenceDetail?.status ?? null;
      return {
        week: row.weekOf,
        convergenceScore: row.convergenceScore,
        trend: status != null ? smoothed[i] : null,
        documentCount: Number(row.documentCount),
        status,
        statusValue: status ? STATUS_BAR_HEIGHT[status] : 0,
        statusFill: status ? statusColors[status] : 'transparent',
        statusOpacity: status ? 0.7 : 0,
      };
    });
  }, [data, statusColors]);

  if (data.length === 0) {
    return (
      <p className="text-sm text-dm-text-secondary py-8 text-center">No status data available.</p>
    );
  }

  return (
    <div className="[&_svg.recharts-surface]:overflow-visible">
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-[11px] text-dm-text-secondary">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block w-4 h-0.5 border-t-2 border-dashed"
            style={{ borderColor: colors.textSecondary }}
          />
          Trend
        </span>
        {(['Elevated', 'ConfirmedConcern'] as ConcernLevel[]).map((s) => (
          <span key={s} className="flex items-center gap-1.5">
            <span
              className="inline-block w-3 h-3 rounded-sm"
              style={{ backgroundColor: statusColors[s] }}
            />
            {s === 'ConfirmedConcern' ? 'Sustained' : 'Notable'}
          </span>
        ))}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={chartData}
          margin={{ top: 8, right: 70, bottom: 4, left: 10 }}
          onClick={(state) => {
            const week = state?.activeLabel;
            if (typeof week === 'string' && week) onWeekClick(week);
          }}
          style={{ cursor: 'pointer' }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} opacity={0.5} />
          <XAxis
            dataKey="week"
            tickFormatter={formatWeekLabel}
            tick={{ fontSize: 11, fill: colors.textSecondary }}
            tickLine={false}
            axisLine={{ stroke: colors.border }}
          />
          <YAxis
            yAxisId="score"
            tick={{ fontSize: 10, fill: colors.textSecondary }}
            tickFormatter={(v: number) => SCORE_TICK_LABELS[v] ?? ''}
            tickLine={false}
            axisLine={false}
            width={60}
            domain={[0, 2]}
            ticks={[0, 1, 2]}
          />
          <Tooltip content={<StatusTooltip mode={mode} />} />

          {/* Status bars — uses shape prop instead of Cell to avoid Brush index misalignment */}
          <Bar
            yAxisId="score"
            dataKey="statusValue"
            barSize={6}
            isAnimationActive={false}
            shape={StatusBarShape}
          />

          {/* Trend line (moving average of convergence score) */}
          <Line
            yAxisId="score"
            type="monotone"
            dataKey="trend"
            stroke={colors.textSecondary}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            activeDot={{ r: 4, cursor: 'pointer' }}
            connectNulls
          />

          {/* Selected week indicator */}
          {selectedWeek && (
            <ReferenceLine
              yAxisId="score"
              x={selectedWeek}
              stroke={colors.accent}
              strokeWidth={2}
              strokeDasharray="4 2"
            />
          )}

          <Brush
            dataKey="week"
            tickFormatter={formatWeekLabel}
            height={30}
            fontSize={10}
            stroke={colors.accent}
            fill={mode === 'dark' ? '#1e293b' : '#f8fafc'}
            startIndex={brushStartIndex}
            endIndex={brushEndIndex}
            onChange={(range) => {
              if (
                range &&
                typeof range.startIndex === 'number' &&
                typeof range.endIndex === 'number'
              ) {
                onRangeChange(range.startIndex, range.endIndex);
              }
            }}
          />
        </ComposedChart>
      </ResponsiveContainer>
      {rangeLabel && <p className="text-[11px] text-dm-muted text-center -mt-1">{rangeLabel}</p>}
    </div>
  );
}
