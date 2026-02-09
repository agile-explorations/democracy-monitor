import { useCallback, useEffect, useState } from 'react';
import {
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Line,
  ComposedChart,
} from 'recharts';
import type { TrajectoryPoint } from '@/lib/services/snapshot-store';

const STATUS_LEVEL: Record<string, number> = {
  Stable: 0,
  Warning: 1,
  Drift: 2,
  Capture: 3,
};

interface DocumentPoint {
  id: number;
  title: string;
  url: string | null;
  publishedAt: string | null;
  sourceType: string;
}

interface CategoryTimelineProps {
  category: string;
  trajectory: TrajectoryPoint[];
  from?: string;
  to?: string;
}

function CategoryTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{
    payload: { week: string; statusLevel: number; reason: string; matchCount: number };
  }>;
}) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;
  const level = ['Stable', 'Warning', 'Drift', 'Capture'][d.statusLevel];
  return (
    <div className="bg-white border border-slate-200 rounded-lg shadow-lg p-3 max-w-sm">
      <p className="font-medium text-sm">{d.week}</p>
      <p className="text-xs text-slate-600">
        Status: {level} ({d.matchCount} matches)
      </p>
      <p className="text-xs text-slate-500 mt-1">{d.reason}</p>
    </div>
  );
}

export function CategoryTimeline({ category, trajectory, from, to }: CategoryTimelineProps) {
  const [documents, setDocuments] = useState<DocumentPoint[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ category });
      if (from) params.set('from', from);
      if (to) params.set('to', to);
      params.set('limit', '200');

      const res = await fetch(`/api/history/documents?${params}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, [category, from, to]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  // Merge trajectory and document data
  const chartData = trajectory.map((t) => ({
    week: t.week,
    statusLevel: STATUS_LEVEL[t.status] ?? 0,
    reason: t.reason,
    matchCount: t.matchCount,
  }));

  return (
    <div>
      <div className="mb-2">
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
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
            <Tooltip content={<CategoryTooltip />} />
            <Line
              type="monotone"
              dataKey="statusLevel"
              stroke="#6366f1"
              strokeWidth={2}
              dot={{ r: 3 }}
              name="Assessment"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Document list */}
      <div className="mt-4">
        <h4 className="text-sm font-medium text-slate-700 mb-2">
          Documents ({loading ? '...' : documents.length})
        </h4>
        <div className="max-h-60 overflow-y-auto space-y-1">
          {documents.slice(0, 50).map((doc) => (
            <div
              key={doc.id}
              className="flex items-start gap-2 text-xs py-1 border-b border-slate-100"
            >
              <span className="text-slate-400 whitespace-nowrap">
                {doc.publishedAt ? new Date(doc.publishedAt).toLocaleDateString() : 'n/a'}
              </span>
              {doc.url ? (
                <a
                  href={doc.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline truncate"
                >
                  {doc.title}
                </a>
              ) : (
                <span className="text-slate-700 truncate">{doc.title}</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
