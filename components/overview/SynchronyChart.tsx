import { useMemo } from 'react';
import {
  Area,
  AreaChart,
  Brush,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { CHART_COLORS } from '@/lib/data/chart-colors';
import type { SynchronyPoint } from '@/lib/types/overview';
import { formatWeekLabel } from '@/lib/utils/date-utils';

export interface SynchronyChartProps {
  data: SynchronyPoint[];
  mode: 'light' | 'dark';
  brushStartIndex?: number;
  brushEndIndex?: number;
  onRangeChange?: (startIndex: number, endIndex: number) => void;
  selectedWeek?: string | null;
  onWeekClick?: (week: string) => void;
}

function SynchronyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: SynchronyPoint }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-dm-border bg-dm-card px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-dm-text-primary">{formatWeekLabel(d.week)}</p>
      <p className="text-dm-text-secondary mt-1">
        {d.elevatedCount} {d.elevatedCount === 1 ? 'category' : 'categories'} elevated
      </p>
    </div>
  );
}

export function SynchronyChart({
  data,
  mode,
  brushStartIndex,
  brushEndIndex,
  onRangeChange,
  selectedWeek,
  onWeekClick,
}: SynchronyChartProps) {
  const colors = useMemo(() => CHART_COLORS[mode], [mode]);

  const startIdx = brushStartIndex ?? 0;
  const endIdx = brushEndIndex ?? data.length - 1;
  const rangeLabel = useMemo(() => {
    if (data.length === 0) return '';
    const startWeek = data[startIdx]?.week;
    const endWeek = data[endIdx]?.week;
    if (!startWeek || !endWeek) return '';
    return `${formatWeekLabel(startWeek)} \u2013 ${formatWeekLabel(endWeek)}`;
  }, [data, startIdx, endIdx]);

  if (data.length === 0) {
    return <p className="text-sm text-dm-text-secondary py-4">No synchrony data available.</p>;
  }

  return (
    <div>
      <ResponsiveContainer width="100%" height={250}>
        <AreaChart
          data={data}
          margin={{ top: 8, right: 58, bottom: 4, left: 28 }}
          onClick={
            onWeekClick
              ? (state) => {
                  const week = state?.activeLabel;
                  if (typeof week === 'string' && week) {
                    onWeekClick(week);
                  }
                }
              : undefined
          }
          style={onWeekClick ? { cursor: 'pointer' } : undefined}
        >
          <defs>
            <linearGradient id="synchronyGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={colors.accent} stopOpacity={0.3} />
              <stop offset="95%" stopColor={colors.accent} stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke={colors.border} opacity={0.5} />
          <XAxis
            dataKey="week"
            tickFormatter={formatWeekLabel}
            tick={{ fontSize: 11, fill: colors.textSecondary }}
            tickLine={false}
            axisLine={{ stroke: colors.border }}
          />
          <YAxis
            tick={{ fontSize: 11, fill: colors.textSecondary }}
            tickLine={false}
            axisLine={false}
            width={30}
            allowDecimals={false}
            domain={[0, 'auto']}
          />
          <Tooltip content={<SynchronyTooltip />} />
          <Area
            type="monotone"
            dataKey="elevatedCount"
            stroke={colors.accent}
            strokeWidth={2}
            fill="url(#synchronyGradient)"
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
            onChange={
              onRangeChange
                ? (range) => {
                    if (
                      range &&
                      typeof range.startIndex === 'number' &&
                      typeof range.endIndex === 'number'
                    ) {
                      onRangeChange(range.startIndex, range.endIndex);
                    }
                  }
                : undefined
            }
          />
        </AreaChart>
      </ResponsiveContainer>
      {rangeLabel && <p className="text-[11px] text-dm-muted text-center -mt-1">{rangeLabel}</p>}
    </div>
  );
}
