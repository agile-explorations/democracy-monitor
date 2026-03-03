import { useMemo } from 'react';
import type { ReactElement } from 'react';
import {
  Area,
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
import { CHART_COLORS, CONVERGENCE_STATUS_COLORS } from '@/lib/data/chart-colors';
import type { WeeklyRow } from '@/lib/hooks/useCategoryDetail';
import type { ConvergenceStatus } from '@/lib/types/structural';
import { formatWeekLabel } from '@/lib/utils/date-utils';

export interface CategoryStatusChartProps {
  data: WeeklyRow[];
  baselineAvg: number;
  baselineStdDev: number;
  mode: 'light' | 'dark';
  brushStartIndex?: number;
  brushEndIndex?: number;
  onRangeChange: (start: number, end: number) => void;
  selectedWeek: string | null;
  onWeekClick: (week: string) => void;
}

interface ChartPoint {
  week: string;
  score: number;
  documentCount: number;
  status: ConvergenceStatus | null;
  statusValue: number;
  baselineBand: [number, number];
  baselineAvg: number;
  statusFill: string;
  statusOpacity: number;
}

const STATUS_ORDER: Record<ConvergenceStatus, number> = {
  Stable: 1,
  Elevated: 2,
  Divergent: 3,
  ConfirmedConcern: 4,
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
  const statusColors = CONVERGENCE_STATUS_COLORS[mode];

  return (
    <div className="rounded-md border border-dm-border bg-dm-card px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-dm-text-primary">{formatWeekLabel(d.week)}</p>
      {d.status && (
        <p className="mt-1" style={{ color: statusColors[d.status] }}>
          {d.status}
        </p>
      )}
      <p className="text-dm-text-secondary mt-1">
        Score: <span className="font-medium text-dm-text-primary">{d.score.toFixed(2)}</span>
      </p>
      <p className="text-dm-text-secondary">{d.documentCount} documents</p>
      <p className="text-dm-muted mt-1">Baseline: {d.baselineAvg.toFixed(2)}</p>
    </div>
  );
}

export function CategoryStatusChart({
  data,
  baselineAvg,
  baselineStdDev,
  mode,
  brushStartIndex,
  brushEndIndex,
  onRangeChange,
  selectedWeek,
  onWeekClick,
}: CategoryStatusChartProps) {
  const colors = useMemo(() => CHART_COLORS[mode], [mode]);
  const statusColors = useMemo(() => CONVERGENCE_STATUS_COLORS[mode], [mode]);

  const chartData: ChartPoint[] = useMemo(() => {
    const bandUpper = baselineAvg + baselineStdDev;
    const bandLower = Math.max(0, baselineAvg - baselineStdDev);

    return data.map((row) => {
      const status = row.convergenceDetail?.status ?? null;
      return {
        week: row.weekOf,
        score: Number(row.totalSeverity),
        documentCount: Number(row.documentCount),
        status,
        statusValue: status ? STATUS_ORDER[status] : 0,
        baselineBand: [bandLower, bandUpper] as [number, number],
        baselineAvg,
        statusFill: status ? statusColors[status] : 'transparent',
        statusOpacity: status ? 0.7 : 0,
      };
    });
  }, [data, baselineAvg, baselineStdDev, statusColors]);

  if (data.length === 0) {
    return (
      <p className="text-sm text-dm-text-secondary py-8 text-center">No status data available.</p>
    );
  }

  return (
    <div>
      {/* Legend */}
      <div className="flex flex-wrap items-center gap-4 mb-3 text-[11px] text-dm-text-secondary">
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 bg-dm-accent rounded" />
          Score
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 border-t border-dashed border-slate-400" />
          Baseline
        </span>
        {(['Stable', 'Elevated', 'Divergent', 'ConfirmedConcern'] as ConvergenceStatus[]).map(
          (s) => (
            <span key={s} className="flex items-center gap-1.5">
              <span
                className="inline-block w-3 h-3 rounded-sm"
                style={{ backgroundColor: statusColors[s] }}
              />
              {s === 'ConfirmedConcern' ? 'Concern' : s}
            </span>
          ),
        )}
      </div>

      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart
          data={chartData}
          margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
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
            tick={{ fontSize: 11, fill: colors.textSecondary }}
            tickLine={false}
            axisLine={false}
            width={40}
          />
          <YAxis yAxisId="status" hide domain={[0, 5]} />
          <Tooltip content={<StatusTooltip mode={mode} />} />

          {/* Baseline band */}
          <Area
            yAxisId="score"
            dataKey="baselineBand"
            fill={colors.border}
            stroke="none"
            opacity={0.3}
            isAnimationActive={false}
          />

          {/* Baseline average */}
          <ReferenceLine
            yAxisId="score"
            y={baselineAvg}
            stroke={colors.textSecondary}
            strokeDasharray="4 4"
            strokeWidth={1}
          />

          {/* Status bars — uses shape prop instead of Cell to avoid Brush index misalignment */}
          <Bar
            yAxisId="status"
            dataKey="statusValue"
            barSize={6}
            isAnimationActive={false}
            shape={StatusBarShape}
          />

          {/* Score line */}
          <Line
            yAxisId="score"
            type="monotone"
            dataKey="score"
            stroke={colors.accent}
            strokeWidth={2}
            dot={{ r: 3, fill: colors.accent }}
            activeDot={{ r: 5, cursor: 'pointer' }}
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
    </div>
  );
}
