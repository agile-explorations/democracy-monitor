import { useMemo } from 'react';
import {
  Brush,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { CategoryStatusChartProps } from '@/components/category/CategoryStatusChart';
import { CHART_COLORS, METRIC_LINE_COLORS } from '@/lib/data/chart-colors';
import { formatWeekLabel, formatWeekLabelWithYear } from '@/lib/utils/date-utils';

interface ChartPoint {
  week: string;
  structural: number | null;
  ai: number | null;
  thematic: number | null;
}

const METRIC_LABELS: Record<string, string> = {
  structural: 'Structural',
  ai: 'AI Review',
  thematic: 'Thematic Drift',
};

function MetricsTooltip({
  active,
  payload,
  mode,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: number | null; color: string }>;
  mode: 'light' | 'dark';
}) {
  if (!active || !payload?.length) return null;
  const week = (payload[0] as unknown as { payload: ChartPoint }).payload.week;
  const metricColors = METRIC_LINE_COLORS[mode];

  return (
    <div className="rounded-md border border-dm-border bg-dm-card px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-dm-text-primary mb-1">{formatWeekLabel(week)}</p>
      {(['structural', 'ai', 'thematic'] as const).map((key) => {
        const entry = payload.find((p) => p.dataKey === key);
        return (
          <p key={key} className="flex items-center gap-1.5">
            <span
              className="inline-block w-2 h-2 rounded-full"
              style={{ backgroundColor: metricColors[key] }}
            />
            <span className="text-dm-text-secondary">{METRIC_LABELS[key]}:</span>
            <span className="font-medium text-dm-text-primary">
              {entry?.value != null ? entry.value.toFixed(1) : '—'}
            </span>
          </p>
        );
      })}
    </div>
  );
}

export function DescriptiveMetricsChart({
  data,
  mode,
  brushStartIndex,
  brushEndIndex,
  onRangeChange,
  selectedWeek,
  onWeekClick,
}: CategoryStatusChartProps) {
  const colors = useMemo(() => CHART_COLORS[mode], [mode]);
  const metricColors = useMemo(() => METRIC_LINE_COLORS[mode], [mode]);

  const startIdx = brushStartIndex ?? 0;
  const endIdx = brushEndIndex ?? data.length - 1;
  const rangeLabel = useMemo(() => {
    if (data.length === 0) return '';
    const startWeek = data[startIdx]?.weekOf;
    const endWeek = data[endIdx]?.weekOf;
    if (!startWeek || !endWeek) return '';
    return `${formatWeekLabelWithYear(startWeek)} \u2013 ${formatWeekLabelWithYear(endWeek)}`;
  }, [data, startIdx, endIdx]);

  const chartData: ChartPoint[] = useMemo(
    () =>
      data.map((row) => ({
        week: row.weekOf,
        structural: row.structuralScore,
        ai: row.aiScore,
        thematic: row.thematicScore,
      })),
    [data],
  );

  if (data.length === 0) {
    return (
      <p className="text-sm text-dm-text-secondary py-8 text-center">No metrics data available.</p>
    );
  }

  return (
    <div className="[&_svg.recharts-surface]:overflow-visible">
      <ResponsiveContainer width="100%" height={320}>
        <LineChart
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
            tick={{ fontSize: 10, fill: colors.textSecondary }}
            tickLine={false}
            axisLine={false}
            width={40}
            domain={[0, 100]}
          />
          <Tooltip content={<MetricsTooltip mode={mode} />} />
          <Legend
            wrapperStyle={{ fontSize: 11 }}
            formatter={(value: string) => METRIC_LABELS[value] ?? value}
          />

          <Line
            type="monotone"
            dataKey="structural"
            stroke={metricColors.structural}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, cursor: 'pointer' }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="ai"
            stroke={metricColors.ai}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, cursor: 'pointer' }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="thematic"
            stroke={metricColors.thematic}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, cursor: 'pointer' }}
            connectNulls
          />

          {selectedWeek && (
            <ReferenceLine
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
        </LineChart>
      </ResponsiveContainer>
      {rangeLabel && <p className="text-[11px] text-dm-muted text-center -mt-1">{rangeLabel}</p>}
    </div>
  );
}
