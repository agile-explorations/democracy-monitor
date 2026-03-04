import { useMemo } from 'react';
import {
  Area,
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
import type { ReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { CHART_COLORS, CONVERGENCE_STATUS_COLORS } from '@/lib/data/chart-colors';
import type { SynchronyPoint } from '@/lib/types/overview';
import { formatWeekLabel } from '@/lib/utils/date-utils';
import { movingAverage } from '@/lib/utils/math';

const TREND_WINDOW = 4;

type StatusColorMap = Record<'Stable' | 'Elevated' | 'Divergent' | 'ConfirmedConcern', string>;

interface TrendPoint extends SynchronyPoint {
  trend: number;
}

export interface SynchronyChartProps {
  data: SynchronyPoint[];
  mode: 'light' | 'dark';
  readingLevel: ReadingLevel;
  brushStartIndex?: number;
  brushEndIndex?: number;
  onRangeChange?: (startIndex: number, endIndex: number) => void;
  selectedWeek?: string | null;
  onWeekClick?: (week: string) => void;
}

type TooltipPayload = Array<{ payload: TrendPoint }>;

function SummaryTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-dm-border bg-dm-card px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-dm-text-primary">{formatWeekLabel(d.week)}</p>
      <p className="text-dm-text-secondary mt-1">Concern score: {d.weightedScore}</p>
      <p className="text-dm-text-secondary">Trend: {d.trend.toFixed(1)}</p>
    </div>
  );
}

function DetailedTooltip({
  active,
  payload,
  statusColors,
}: {
  active?: boolean;
  payload?: TooltipPayload;
  statusColors: StatusColorMap;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-dm-border bg-dm-card px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-dm-text-primary">{formatWeekLabel(d.week)}</p>
      <div className="mt-1 space-y-0.5">
        {d.confirmedWeighted > 0 && (
          <p style={{ color: statusColors.ConfirmedConcern }}>
            Confirmed Concern: {d.confirmedWeighted}
          </p>
        )}
        {d.divergentWeighted > 0 && (
          <p style={{ color: statusColors.Divergent }}>Divergent: {d.divergentWeighted}</p>
        )}
        {d.elevatedWeighted > 0 && (
          <p style={{ color: statusColors.Elevated }}>Elevated: {d.elevatedWeighted}</p>
        )}
      </div>
      <p className="text-dm-text-secondary mt-1">Total: {d.weightedScore}</p>
      <p className="text-dm-text-secondary">Trend: {d.trend.toFixed(1)}</p>
    </div>
  );
}

function Swatch({ color, opacity }: { color: string; opacity?: number }) {
  return (
    <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: color, opacity }} />
  );
}

function ChartLegend({
  readingLevel,
  statusColors,
  trendColor,
}: {
  readingLevel: ReadingLevel;
  statusColors: StatusColorMap;
  trendColor: string;
}) {
  return (
    <div className="flex items-center gap-4 text-[11px] text-dm-text-secondary mb-1">
      {readingLevel === 'summary' ? (
        <span className="flex items-center gap-1">
          <Swatch color={statusColors.Elevated} opacity={0.5} />
          Concern Score
        </span>
      ) : (
        <>
          <span className="flex items-center gap-1">
            <Swatch color={statusColors.ConfirmedConcern} /> Confirmed
          </span>
          <span className="flex items-center gap-1">
            <Swatch color={statusColors.Divergent} /> Divergent
          </span>
          <span className="flex items-center gap-1">
            <Swatch color={statusColors.Elevated} /> Elevated
          </span>
        </>
      )}
      <span className="flex items-center gap-1">
        <span
          className="inline-block w-3 h-0.5"
          style={{ backgroundColor: trendColor, borderTop: `2px dashed ${trendColor}` }}
        />
        Trend
      </span>
    </div>
  );
}

export function SynchronyChart({
  data,
  mode,
  readingLevel,
  brushStartIndex,
  brushEndIndex,
  onRangeChange,
  selectedWeek,
  onWeekClick,
}: SynchronyChartProps) {
  const colors = useMemo(() => CHART_COLORS[mode], [mode]);
  const statusColors: StatusColorMap = useMemo(() => CONVERGENCE_STATUS_COLORS[mode], [mode]);
  const trendColor = mode === 'dark' ? '#f1f5f9' : '#334155';

  const trendData: TrendPoint[] = useMemo(() => {
    const scores = data.map((d) => d.weightedScore);
    const trend = movingAverage(scores, TREND_WINDOW);
    return data.map((d, i) => ({ ...d, trend: trend[i] }));
  }, [data]);

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
    return <p className="text-sm text-dm-text-secondary py-4">No concern data available.</p>;
  }

  return (
    <div>
      <ChartLegend
        readingLevel={readingLevel}
        statusColors={statusColors}
        trendColor={trendColor}
      />
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart
          data={trendData}
          margin={{ top: 8, right: 58, bottom: 4, left: 28 }}
          onClick={
            onWeekClick
              ? (state) => {
                  const week = state?.activeLabel;
                  if (typeof week === 'string' && week) onWeekClick(week);
                }
              : undefined
          }
          style={onWeekClick ? { cursor: 'pointer' } : undefined}
        >
          <defs>
            <linearGradient id="weightedScoreGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={statusColors.Elevated} stopOpacity={0.3} />
              <stop offset="95%" stopColor={statusColors.Elevated} stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="elevatedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={statusColors.Elevated} stopOpacity={0.4} />
              <stop offset="95%" stopColor={statusColors.Elevated} stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="divergentGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={statusColors.Divergent} stopOpacity={0.4} />
              <stop offset="95%" stopColor={statusColors.Divergent} stopOpacity={0.1} />
            </linearGradient>
            <linearGradient id="confirmedGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={statusColors.ConfirmedConcern} stopOpacity={0.4} />
              <stop offset="95%" stopColor={statusColors.ConfirmedConcern} stopOpacity={0.1} />
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
          {readingLevel === 'summary' ? (
            <>
              <Tooltip content={<SummaryTooltip />} />
              <Area
                type="monotone"
                dataKey="weightedScore"
                stroke={statusColors.Elevated}
                strokeWidth={2}
                fill="url(#weightedScoreGradient)"
              />
            </>
          ) : (
            <>
              <Tooltip content={<DetailedTooltip statusColors={statusColors} />} />
              <Area
                type="monotone"
                dataKey="confirmedWeighted"
                stackId="concern"
                stroke={statusColors.ConfirmedConcern}
                strokeWidth={1}
                fill="url(#confirmedGradient)"
              />
              <Area
                type="monotone"
                dataKey="divergentWeighted"
                stackId="concern"
                stroke={statusColors.Divergent}
                strokeWidth={1}
                fill="url(#divergentGradient)"
              />
              <Area
                type="monotone"
                dataKey="elevatedWeighted"
                stackId="concern"
                stroke={statusColors.Elevated}
                strokeWidth={1}
                fill="url(#elevatedGradient)"
              />
            </>
          )}
          <Line
            type="monotone"
            dataKey="trend"
            stroke={trendColor}
            strokeWidth={2}
            strokeDasharray="6 3"
            dot={false}
            isAnimationActive={false}
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
        </ComposedChart>
      </ResponsiveContainer>
      {rangeLabel && <p className="text-[11px] text-dm-muted text-center -mt-1">{rangeLabel}</p>}
    </div>
  );
}
