import { useMemo } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { getCurrentCycleYear, PRIMARY_BASELINE_CYCLE_YEAR } from '@/lib/methodology/scoring-config';

/** Resolved chart colors per mode — recharts SVG attrs don't support CSS var() */
const CHART_COLORS = {
  light: {
    accent: '#4f46e5',
    border: '#e2e8f0',
    textSecondary: '#64748b',
  },
  dark: {
    accent: '#818cf8',
    border: '#334155',
    textSecondary: '#94a3b8',
  },
} as const;

export interface TrendDataPoint {
  week: string;
  score: number;
  documentCount?: number;
}

export interface TrendChartProps {
  data: TrendDataPoint[];
  baselineAvg: number;
  baselineStdDev: number;
  readingLevel: 'summary' | 'detailed';
  onWeekClick?: (week: string) => void;
}

function formatWeekLabel(week: string): string {
  const d = new Date(week + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function CycleAnnotation() {
  const cycleYear = getCurrentCycleYear();
  if (cycleYear === PRIMARY_BASELINE_CYCLE_YEAR) return null;

  return (
    <div className="mt-2 flex items-start gap-2 rounded-md bg-slate-50 dark:bg-slate-800/50 border border-dm-border/50 px-3 py-2 text-[11px] text-dm-text-secondary leading-relaxed">
      <span className="shrink-0 mt-0.5">{'\u2298'}</span>
      <span>
        <strong>Cycle context:</strong> Comparing Year {cycleYear} against a Year{' '}
        {PRIMARY_BASELINE_CYCLE_YEAR} baseline. First-year terms typically show higher document
        volume and severity due to transition activity.
      </span>
    </div>
  );
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: TrendDataPoint & { baselineAvg: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-md border border-dm-border bg-dm-card px-3 py-2 shadow-md text-xs">
      <p className="font-medium text-dm-text-primary">{formatWeekLabel(d.week)}</p>
      <p className="text-dm-text-secondary mt-1">
        Score: <span className="font-medium text-dm-text-primary">{d.score.toFixed(2)}</span>
      </p>
      {d.documentCount !== undefined && (
        <p className="text-dm-text-secondary">{d.documentCount} documents</p>
      )}
      <p className="text-dm-muted mt-1">Baseline: {d.baselineAvg.toFixed(2)}</p>
    </div>
  );
}

export function TrendChart({
  data,
  baselineAvg,
  baselineStdDev,
  readingLevel,
  onWeekClick,
}: TrendChartProps) {
  const { resolvedMode } = useTheme();
  const colors = useMemo(() => CHART_COLORS[resolvedMode], [resolvedMode]);

  if (data.length === 0) {
    return (
      <p className="text-sm text-dm-text-secondary py-8 text-center">No trend data available.</p>
    );
  }

  const bandUpper = baselineAvg + baselineStdDev;
  const bandLower = Math.max(0, baselineAvg - baselineStdDev);

  // Add baseline band values to data
  const chartData = data.map((d) => ({
    ...d,
    baselineBand: [bandLower, bandUpper] as [number, number],
    baselineAvg,
  }));

  return (
    <div>
      {readingLevel === 'detailed' && (
        <div className="flex items-center gap-4 mb-3 text-[11px] text-dm-text-secondary">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 bg-dm-accent rounded" />
            Decay-weighted score
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-0.5 border-t border-dashed border-slate-400" />
            Baseline avg
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-4 h-2 bg-slate-200 dark:bg-slate-700 rounded-sm" />
            Baseline ±1σ
          </span>
        </div>
      )}

      <ResponsiveContainer width="100%" height={280}>
        <ComposedChart
          data={chartData}
          margin={{ top: 8, right: 8, bottom: 4, left: 0 }}
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
            width={40}
          />
          <Tooltip content={<ChartTooltip />} />

          {/* Baseline ±1σ band */}
          <Area
            dataKey="baselineBand"
            fill={colors.border}
            stroke="none"
            opacity={0.3}
            isAnimationActive={false}
          />

          {/* Baseline average line */}
          <ReferenceLine
            y={baselineAvg}
            stroke={colors.textSecondary}
            strokeDasharray="4 4"
            strokeWidth={1}
          />

          {/* Primary score line */}
          <Line
            type="monotone"
            dataKey="score"
            stroke={colors.accent}
            strokeWidth={2}
            dot={{ r: 3, fill: colors.accent }}
            activeDot={{ r: 5, cursor: onWeekClick ? 'pointer' : 'default' }}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <CycleAnnotation />
    </div>
  );
}
