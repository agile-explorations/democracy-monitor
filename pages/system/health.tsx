import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
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

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(endpoint);
        if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
        if (!cancelled) setData(await res.json());
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

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
          {data && !loading && renderReport(data)}
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
              description="Source coverage, content completeness, and fetch error rates across all data sources."
              endpoint="/api/health/validate-ingest"
              renderReport={renderIngest}
            />
            <ValidationPanel
              title="Data Readiness"
              description="Pipeline completeness across scoring, embedding, aggregation, and AI assessment stages."
              endpoint="/api/health/validate-data"
              renderReport={renderDataReport}
            />
            <ValidationPanel
              title="Detection Correctness"
              description="Validates the system correctly detects known events and does not over-flag during calm baseline periods."
              endpoint="/api/health/validate-detection"
              renderReport={renderDetection}
            />
            <ValidationPanel
              title="Derivation Graph"
              description="Edge-contract invariants across the derivation pipeline: every eligible document scored, aggregates present with matching counts, enrichment and narratives fresh."
              endpoint="/api/health/validate-graph"
              renderReport={renderGraph}
            />
            <ValidationPanel
              title="Historical Backtest"
              description="Tests detection accuracy against Trump T1 (2017-2018) known events with per-category precision and noise metrics."
              endpoint="/api/health/backtest"
              renderReport={renderBacktest}
            />
          </>
        )}
      </div>
    </>
  );
}
