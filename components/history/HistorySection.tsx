import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/Card';
import { CATEGORIES } from '@/lib/data/categories';
import type { TrajectoryPoint } from '@/lib/services/snapshot-store';
import { CategoryTimeline } from './CategoryTimeline';
import { TrajectoryChart } from './TrajectoryChart';

const INAUGURATION = '2025-01-20';

interface HistorySummary {
  documents: { total: number; byCategory: Array<{ category: string; count: number }> };
  snapshots: { total: number; byCategory: Array<{ category: string; count: number }> };
}

interface ConvergencePoint {
  week: string;
  activeThemeCount: number;
  convergence: string;
}

export function HistorySection() {
  const [trajectory, setTrajectory] = useState<Record<string, TrajectoryPoint[]>>({});
  const [summary, setSummary] = useState<HistorySummary | null>(null);
  const [convergenceTimeline, setConvergenceTimeline] = useState<ConvergencePoint[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [trajRes, summaryRes, convRes] = await Promise.all([
        fetch(`/api/history/trajectory?from=${INAUGURATION}`),
        fetch('/api/history/summary'),
        fetch(`/api/history/convergence?from=${INAUGURATION}`),
      ]);

      if (trajRes.ok) {
        setTrajectory(await trajRes.json());
      }
      if (summaryRes.ok) {
        setSummary(await summaryRes.json());
      }
      if (convRes.ok) {
        setConvergenceTimeline(await convRes.json());
      }
    } catch {
      setError('Failed to load historical data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  if (loading) {
    return (
      <Card>
        <div className="animate-pulse text-center py-8 text-slate-400">
          Loading historical data...
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <div className="text-center py-8 text-red-500">{error}</div>
      </Card>
    );
  }

  const hasData = Object.keys(trajectory).length > 0;

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{summary.documents.total}</div>
            <div className="text-xs text-slate-500">Documents Tracked</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{summary.snapshots.total}</div>
            <div className="text-xs text-slate-500">Assessment Snapshots</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">
              {summary.documents.byCategory.length}
            </div>
            <div className="text-xs text-slate-500">Categories</div>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">
              {Object.values(trajectory).reduce((acc, pts) => acc + pts.length, 0)}
            </div>
            <div className="text-xs text-slate-500">Weekly Data Points</div>
          </div>
        </div>
      )}

      {/* All-category trajectory chart */}
      <Card>
        <h3 className="text-base font-semibold text-slate-900 mb-4">
          Institutional Health Trajectory
        </h3>
        <p className="text-xs text-slate-500 mb-4">
          Assessment status (Stable → Capture) per category over time since Jan 20, 2025
        </p>
        {hasData ? (
          <TrajectoryChart data={trajectory} convergenceData={convergenceTimeline} />
        ) : (
          <p className="text-center text-slate-400 py-8">
            No trajectory data yet. Run{' '}
            <code className="bg-slate-100 px-1 rounded">pnpm backfill</code> to populate historical
            data.
          </p>
        )}
      </Card>

      {/* Category drill-down */}
      <Card>
        <h3 className="text-base font-semibold text-slate-900 mb-4">Category Detail</h3>
        <div className="flex flex-wrap gap-2 mb-4">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.key}
              onClick={() => setSelectedCategory(selectedCategory === cat.key ? null : cat.key)}
              className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                selectedCategory === cat.key
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-indigo-300'
              }`}
            >
              {cat.title}
            </button>
          ))}
        </div>

        {selectedCategory && trajectory[selectedCategory] ? (
          <CategoryTimeline
            category={selectedCategory}
            trajectory={trajectory[selectedCategory]}
            from={INAUGURATION}
          />
        ) : selectedCategory ? (
          <p className="text-center text-slate-400 py-4">No data for this category yet.</p>
        ) : (
          <p className="text-center text-slate-400 py-4">
            Select a category to view its detailed timeline.
          </p>
        )}
      </Card>
    </div>
  );
}
