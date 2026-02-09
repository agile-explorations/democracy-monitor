import { useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import type { TrajectoryPoint } from '@/lib/services/snapshot-store';

const STATUS_LEVEL: Record<string, number> = {
  Stable: 0,
  Warning: 1,
  Drift: 2,
  Capture: 3,
};

const CATEGORY_COLORS: Record<string, string> = {
  civilService: '#6366f1',
  fiscal: '#8b5cf6',
  igs: '#a855f7',
  hatch: '#d946ef',
  courts: '#ec4899',
  military: '#f43f5e',
  rulemaking: '#f97316',
  indices: '#eab308',
  infoAvailability: '#22c55e',
  elections: '#14b8a6',
  mediaFreedom: '#06b6d4',
};

interface TrajectoryChartProps {
  data: Record<string, TrajectoryPoint[]>;
  convergenceData?: Array<{
    week: string;
    activeThemeCount: number;
    convergence: string;
  }>;
}

interface ChartDataPoint {
  week: string;
  [key: string]: string | number;
}

function TrajectoryTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ dataKey: string; value: unknown; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 max-w-xs">
      <p className="font-medium text-sm text-slate-900 mb-1">{label}</p>
      {payload.map((entry) => {
        const cat = entry.dataKey as string;
        if (cat === 'convergence' || cat.endsWith('_reason')) return null;
        const level = ['Stable', 'Warning', 'Drift', 'Capture'][entry.value as number];
        return (
          <p key={cat} className="text-xs" style={{ color: entry.color }}>
            {cat}: {level}
          </p>
        );
      })}
    </div>
  );
}

export function TrajectoryChart({ data, convergenceData }: TrajectoryChartProps) {
  const chartData = useMemo(() => {
    // Collect all unique weeks
    const weekSet = new Set<string>();
    for (const points of Object.values(data)) {
      for (const p of points) weekSet.add(p.week);
    }
    const weeks = Array.from(weekSet).sort();

    // Build one row per week with category status levels
    return weeks.map((week) => {
      const point: ChartDataPoint = { week };
      for (const [cat, points] of Object.entries(data)) {
        const match = points.find((p) => p.week === week);
        point[cat] = match ? (STATUS_LEVEL[match.status] ?? 0) : 0;
        point[`${cat}_reason`] = match?.reason || '';
      }
      // Add convergence data if available
      if (convergenceData) {
        const conv = convergenceData.find((c) => c.week === week);
        if (conv) {
          point['convergence'] = conv.activeThemeCount;
        }
      }
      return point;
    });
  }, [data, convergenceData]);

  const categories = Object.keys(data);

  if (chartData.length === 0) {
    return (
      <div className="text-center text-slate-500 py-8">
        No trajectory data available. Run the backfill script to populate historical data.
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={400}>
      <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
        <XAxis
          dataKey="week"
          tick={{ fontSize: 11 }}
          tickFormatter={(v: string) => {
            const d = new Date(v);
            return `${d.getMonth() + 1}/${d.getDate()}`;
          }}
        />
        <YAxis
          domain={[0, 3]}
          ticks={[0, 1, 2, 3]}
          tickFormatter={(v: number) => ['Stable', 'Warning', 'Drift', 'Capture'][v] || ''}
          tick={{ fontSize: 11 }}
          width={70}
        />
        <Tooltip content={<TrajectoryTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) => {
            const labels: Record<string, string> = {
              civilService: 'Civil Service',
              fiscal: 'Fiscal',
              igs: 'IGs',
              hatch: 'Hatch Act',
              courts: 'Courts',
              military: 'Military',
              rulemaking: 'Rulemaking',
              indices: 'Exec Power Vol',
              infoAvailability: 'Info Access',
              elections: 'Elections',
              mediaFreedom: 'Press Freedom',
              convergence: 'Infrastructure',
            };
            return labels[value] || value;
          }}
        />
        {categories.map((cat) => (
          <Line
            key={cat}
            type="monotone"
            dataKey={cat}
            stroke={CATEGORY_COLORS[cat] || '#94a3b8'}
            strokeWidth={2}
            dot={false}
            connectNulls
          />
        ))}
        {convergenceData && convergenceData.length > 0 && (
          <Line
            type="stepAfter"
            dataKey="convergence"
            stroke="#991b1b"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            connectNulls
          />
        )}
      </LineChart>
    </ResponsiveContainer>
  );
}
