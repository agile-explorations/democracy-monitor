import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SourceHealthTimeline } from '@/components/overview/SourceHealthTimeline';
import { SEOHead } from '@/components/shared/SEOHead';
import { HealthSummary } from '@/components/system/HealthSummary';
import {
  renderIngest,
  renderDataReport,
  renderDetection,
  renderGraph,
  renderBacktest,
} from '@/components/system/ValidationReports';
import { Chevron } from '@/components/ui/Chevron';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { T2_INAUGURATION } from '@/lib/data/analysis-periods';
import type { FetchWeekHealth } from '@/lib/types/overview';

/** Format an ISO timestamp for the freshness stamp, e.g. "Aug 1, 1:06 PM". */
function formatStamp(iso?: string | null): string {
  if (!iso) return 'not yet computed';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** A report's cached data is stale if computed more than a day ago (weekly cron). */
function isStale(iso?: string | null): boolean {
  return !iso || Date.now() - new Date(iso).getTime() > 25 * 60 * 60 * 1000;
}

function FreshnessBar({
  data,
  onRefresh,
  loading,
}: {
  data: any;
  onRefresh: () => void;
  loading: boolean;
}) {
  const cached: string | undefined = data.generatedAt;
  const live: string | undefined = data.liveAt;
  return (
    <div className="flex items-center justify-between mb-3 text-[11px] text-dm-muted">
      <span>
        {live && <span className="text-green-600 dark:text-green-400">Freshness live · </span>}
        {data.pending && !cached ? (
          'computing on next snapshot'
        ) : (
          <>
            as of {formatStamp(cached)}
            {isStale(cached) && (
              <span className="text-amber-600 dark:text-amber-400"> (stale)</span>
            )}
          </>
        )}
      </span>
      <button
        onClick={onRefresh}
        disabled={loading}
        className="rounded border border-dm-border px-2 py-0.5 hover:bg-dm-border/20 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Refreshing…' : 'Refresh'}
      </button>
    </div>
  );
}

function ValidationPanel({
  title,
  description,
  endpoint,
  renderReport,
}: {
  title: string;
  description: string;
  endpoint: string;
  renderReport: (data: any) => React.ReactNode;
}) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint);
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="rounded-lg border border-dm-border bg-dm-card">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-dm-border/20 transition-colors"
      >
        <div>
          <span className="text-sm font-semibold text-dm-text-primary">{title}</span>
          <p className="text-xs text-dm-muted mt-0.5">{description}</p>
        </div>
        <span className="text-dm-muted text-xs shrink-0 ml-4">
          {loading ? '\u25CF' : <Chevron open={open} />}
        </span>
      </button>
      {open && (
        <div className="px-5 pb-5">
          {loading && (
            <div className="animate-pulse space-y-2">
              <div className="h-3 w-full bg-dm-border/40 rounded" />
              <div className="h-3 w-5/6 bg-dm-border/40 rounded" />
              <div className="h-3 w-4/6 bg-dm-border/40 rounded" />
            </div>
          )}
          {error && <p className="text-sm text-red-500">Failed to load: {error}</p>}
          {data && !loading && (
            <>
              <FreshnessBar data={data} onRefresh={load} loading={loading} />
              {renderReport(data)}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function HealthPage() {
  const { resolvedMode } = useTheme();
  const { readingLevel } = useReadingLevel();
  const [fetchTimeline, setFetchTimeline] = useState<FetchWeekHealth[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/health/fetch-timeline');
        if (res.ok) setFetchTimeline(await res.json());
      } catch {
        // silently fail
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Filter to Trump T2 only
  const t2Timeline = useMemo(
    () => fetchTimeline.filter((w) => w.week >= T2_INAUGURATION),
    [fetchTimeline],
  );

  return (
    <>
      <SEOHead
        title="System Health"
        description="Source availability and data quality monitoring for Democracy Monitor."
        canonicalPath="/system/health"
      />

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      <h1 className="text-xl font-bold text-dm-text-primary mt-4 mb-6">System Health</h1>

      <div className="space-y-6">
        {/* Source Fetch Health — current term — Trump T2 */}
        <section>
          {loading ? (
            <div className="animate-pulse h-32 bg-dm-border/30 rounded-lg" />
          ) : t2Timeline.length > 0 ? (
            <SourceHealthTimeline data={t2Timeline} mode={resolvedMode} />
          ) : (
            <p className="text-sm text-dm-muted">No fetch timeline data available.</p>
          )}
        </section>

        {readingLevel === 'summary' ? (
          <HealthSummary />
        ) : (
          <>
            <ValidationPanel
              title="Ingest Health"
              description="Did we acquire the expected inputs, with complete content? — Source/document coverage, content completeness, pagination, period coverage, metadata classification, and fetch errors."
              endpoint="/api/health/validate-ingest"
              renderReport={renderIngest}
            />
            <ValidationPanel
              title="Data Readiness"
              description="Of the data we have, what's the processing backlog and do we have enough reference data? — Scoring/embedding backlog, baseline presence, and L2 assessment coverage."
              endpoint="/api/health/validate-data"
              renderReport={renderDataReport}
            />
            <ValidationPanel
              title="Detection Correctness"
              description="Does detection catch known events and reject negative controls? — Known-event recall, negative controls, and layer attribution."
              endpoint="/api/health/validate-detection"
              renderReport={renderDetection}
            />
            <ValidationPanel
              title="Derivation Graph"
              description="Is every derived artifact consistent with and fresh against its inputs? — Edge-contract invariants (G1a–G6): eligible docs scored, aggregates present with matching counts, enrichment/narratives fresh, no orphan categories."
              endpoint="/api/health/validate-graph"
              renderReport={renderGraph}
            />
            <ValidationPanel
              title="Historical Backtest"
              description="Does detection hold up on historical data? — Per-category precision and noise against Trump T1 (2017–2018) known events."
              endpoint="/api/health/backtest"
              renderReport={renderBacktest}
            />
          </>
        )}
      </div>
    </>
  );
}
