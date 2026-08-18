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
import { CHART_COLORS, COMPARISON_COLORS, CONCERN_LEVEL_COLORS } from '@/lib/data/chart-colors';
import { buildMarkersByWeek } from '@/lib/data/instrument-changes';
import type { SynchronyPoint } from '@/lib/types/overview';
import { formatWeekLabel, formatWeekLabelWithYear } from '@/lib/utils/date-utils';
import { movingAverage } from '@/lib/utils/math';
import type { StatusColorMap, TrendPoint } from './SynchronyChartParts';
import { ChartLegend, DetailedTooltip, SummaryTooltip } from './SynchronyChartParts';

const TREND_WINDOW = 4;

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
  const statusColors: StatusColorMap = useMemo(() => CONCERN_LEVEL_COLORS[mode], [mode]);
  const comparisonColors = useMemo(() => COMPARISON_COLORS[mode], [mode]);
  const trendColor = mode === 'dark' ? '#f1f5f9' : '#334155';
  // Comparisons render whenever prior-administration data exists — the
  // toggle button confused users, so the overlay is always on.
  const hasComparison = useMemo(
    () => data.some((d) => d.trumpT1Trend != null || d.bidenT1Trend != null),
    [data],
  );

  const trendData: TrendPoint[] = useMemo(() => {
    const scores = data.map((d) => d.weightedScore);
    const trend = movingAverage(scores, TREND_WINDOW);
    return data.map((d, i) => ({ ...d, trend: trend[i] }));
  }, [data]);

  // Status surface: concern scores are content-derived and gate-verified
  // comparable across collection changes — only status-breaking changes mark.
  const markersByWeek = useMemo(
    () =>
      buildMarkersByWeek(
        data.map((d) => d.week),
        { statusSurface: true },
      ),
    [data],
  );

  const startIdx = brushStartIndex ?? 0;
  const endIdx = brushEndIndex ?? data.length - 1;
  const rangeLabel = useMemo(() => {
    if (data.length === 0) return '';
    const startWeek = data[startIdx]?.week;
    const endWeek = data[endIdx]?.week;
    if (!startWeek || !endWeek) return '';
    return `${formatWeekLabelWithYear(startWeek)} \u2013 ${formatWeekLabelWithYear(endWeek)}`;
  }, [data, startIdx, endIdx]);

  if (data.length === 0) {
    return <p className="text-sm text-dm-text-secondary py-4">No status data available.</p>;
  }

  return (
    <div className="[&_svg.recharts-surface]:overflow-visible">
      <ChartLegend
        readingLevel={readingLevel}
        statusColors={statusColors}
        trendColor={trendColor}
        comparisonColors={comparisonColors}
        hasComparison={hasComparison}
      />
      <ResponsiveContainer width="100%" height={250}>
        <ComposedChart
          data={trendData}
          margin={{ top: 8, right: 70, bottom: 4, left: 10 }}
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
              <Tooltip
                content={
                  <SummaryTooltip
                    showComparison={hasComparison}
                    comparisonColors={comparisonColors}
                  />
                }
              />
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
              <Tooltip
                content={
                  <DetailedTooltip
                    statusColors={statusColors}
                    showComparison={hasComparison}
                    comparisonColors={comparisonColors}
                  />
                }
              />
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
            strokeDasharray="4 3"
            dot={false}
            isAnimationActive={false}
          />
          {hasComparison && (
            <Line
              type="monotone"
              dataKey="trumpT1Trend"
              stroke={comparisonColors.trumpT1}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
          {hasComparison && (
            <Line
              type="monotone"
              dataKey="bidenT1Trend"
              stroke={comparisonColors.bidenT1}
              strokeWidth={1.5}
              strokeDasharray="4 3"
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          )}
          {selectedWeek && (
            <ReferenceLine
              x={selectedWeek}
              stroke={colors.accent}
              strokeWidth={2}
              strokeDasharray="4 2"
            />
          )}
          {/* Methodology-change markers: our own ingest regime shifts, marked
              so count movements aren't read as government behavior. */}
          {[...markersByWeek.keys()].map((week) => (
            <ReferenceLine
              key={`marker-${week}`}
              x={week}
              stroke={colors.textSecondary}
              strokeDasharray="2 4"
              label={{ value: '▲', position: 'top', fontSize: 9, fill: colors.textSecondary }}
            />
          ))}
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
      {markersByWeek.size > 0 && (
        <div className="mt-2 text-[11px] text-dm-text-secondary border-t border-dm-border pt-1.5">
          <span className="text-dm-accent">▲</span>{' '}
          <span className="font-medium">Data collection changes:</span>{' '}
          {[...markersByWeek.entries()]
            .map(([week, labels]) => `${formatWeekLabelWithYear(week)} — ${labels.join('; ')}`)
            .join(' · ')}
        </div>
      )}
    </div>
  );
}
