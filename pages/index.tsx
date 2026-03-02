import Head from 'next/head';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CategoryTable } from '@/components/landing/CategoryTable';
import { DataIntegrityBanner } from '@/components/landing/DataIntegrityBanner';
import { MethodologyFooter } from '@/components/landing/MethodologyFooter';
import { SourceHealthBar } from '@/components/landing/SourceHealthBar';
import { OverviewStatusSummary } from '@/components/overview/OverviewStatusSummary';
import { StatusTimeline } from '@/components/overview/StatusTimeline';
import { SynchronyChart } from '@/components/overview/SynchronyChart';
import type { TimeRangePreset } from '@/components/overview/TimeRangeSelector';
import { TimeRangeSelector, presetToWeekCount } from '@/components/overview/TimeRangeSelector';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { CATEGORIES } from '@/lib/data/categories';
import type { CategorySummary } from '@/lib/services/category-summary-service';
import type { MetaAssessment } from '@/lib/services/meta-assessment-service';
import type { SourceHealthCheck, SourceHealthSummary } from '@/lib/services/source-health-service';
import type { ConvergenceStatus } from '@/lib/types';
import type { OverviewSummary } from '@/lib/types/overview';
import { formatWeekLabel } from '@/lib/utils/date-utils';

export default function Home() {
  const router = useRouter();
  const { readingLevel } = useReadingLevel();
  const { resolvedMode } = useTheme();
  const handleCellClick = useCallback(
    (category: string, week: string) => router.push(`/category/${category}/week/${week}`),
    [router],
  );
  const [categories, setCategories] = useState<CategorySummary[]>([]);
  const [overview, setOverview] = useState<OverviewSummary | null>(null);
  const [meta, setMeta] = useState<MetaAssessment | null>(null);
  const [healthSummary, setHealthSummary] = useState<SourceHealthSummary | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Time range state
  const [rangePreset, setRangePreset] = useState<TimeRangePreset>('all');
  const [brushRange, setBrushRange] = useState<{ start: number; end: number } | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        const [catRes, overviewRes, metaRes, srcRes] = await Promise.all([
          fetch('/api/categories/summary'),
          fetch('/api/overview/summary'),
          fetch('/api/health/meta'),
          fetch('/api/health/sources'),
        ]);
        if (catRes.ok) {
          const data: CategorySummary[] = await catRes.json();
          setCategories(data);
        }
        if (overviewRes.ok) setOverview(await overviewRes.json());
        if (metaRes.ok) setMeta(await metaRes.json());
        if (srcRes.ok) {
          const srcData = await srcRes.json();
          if (srcData.summary) setHealthSummary(srcData.summary);
          if (srcData.sources?.length) {
            const latest = (srcData.sources as SourceHealthCheck[]).reduce(
              (max: string, s: SourceHealthCheck) => (s.checkedAt > max ? s.checkedAt : max),
              srcData.sources[0].checkedAt,
            );
            setLastCheckedAt(latest);
          }
        }
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Compute brush indices from preset
  const totalWeeks = overview?.synchrony.length ?? 0;
  const presetBrushIndices = useMemo(() => {
    if (!totalWeeks) return null;
    const weeksToShow = presetToWeekCount(rangePreset, totalWeeks);
    const start = Math.max(0, totalWeeks - weeksToShow);
    return { start, end: totalWeeks - 1 };
  }, [rangePreset, totalWeeks]);

  // Active range: brush overrides preset
  const activeRange = brushRange ?? presetBrushIndices;

  // Filter overview data by active range
  const filteredOverview = useMemo(() => {
    if (!overview || !activeRange) return overview;
    const { start, end } = activeRange;

    return {
      ...overview,
      statusTimeline: overview.statusTimeline.map((entry) => ({
        ...entry,
        segments: entry.segments.slice(start, end + 1),
      })),
    };
  }, [overview, activeRange]);

  // Aggregate status counts across all category-weeks in the filtered range
  const filteredStatusCounts = useMemo(() => {
    const counts: Record<ConvergenceStatus, number> = {
      Stable: 0,
      Elevated: 0,
      Divergent: 0,
      ConfirmedConcern: 0,
    };
    if (!filteredOverview) return counts;

    for (const entry of filteredOverview.statusTimeline) {
      for (const seg of entry.segments) {
        const status = seg.status ?? 'Stable';
        counts[status]++;
      }
    }
    return counts;
  }, [filteredOverview]);

  // Date range label for the status distribution heading
  const statusRangeLabel = useMemo(() => {
    if (!filteredOverview?.statusTimeline.length) return '';
    const segs = filteredOverview.statusTimeline[0].segments;
    const first = segs[0]?.week;
    const last = segs[segs.length - 1]?.week;
    if (!first || !last) return '';
    return `${formatWeekLabel(first)} \u2013 ${formatWeekLabel(last)}`;
  }, [filteredOverview]);

  const handlePresetChange = useCallback((preset: TimeRangePreset) => {
    setRangePreset(preset);
    setBrushRange(null); // Reset brush when preset changes
  }, []);

  const handleBrushChange = useCallback(
    (startIndex: number, endIndex: number) => {
      setBrushRange({ start: startIndex, end: endIndex });
      // Clear preset highlight if brush differs from any preset
      if (presetBrushIndices) {
        const matches =
          startIndex === presetBrushIndices.start && endIndex === presetBrushIndices.end;
        if (!matches) setRangePreset('all');
      }
    },
    [presetBrushIndices],
  );

  const lastUpdated = categories.find((c) => c.assessedAt)?.assessedAt ?? null;

  return (
    <>
      <Head>
        <title>Democracy Monitor</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta
          name="description"
          content="Automated, transparent analysis of U.S. government documents tracking institutional health across 11 categories."
        />
      </Head>
      <main>
        {/* Subtitle + last updated */}
        <div className="mb-6">
          <p className="text-sm text-dm-text-secondary">
            Automated analysis of the U.S. government documentary record
          </p>
          {lastUpdated && (
            <p className="text-[11px] text-dm-muted mt-1">
              Last updated: {new Date(lastUpdated).toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Data integrity banner (above everything when active) */}
        {meta && (
          <DataIntegrityBanner
            dataIntegrity={meta.dataIntegrity}
            summary={meta.summary}
            healthySources={healthSummary?.healthySources ?? 0}
            totalSources={healthSummary?.totalSources ?? 0}
          />
        )}

        {/* Positioning statement */}
        <section className="mb-6">
          <p className="text-sm text-dm-text-secondary leading-relaxed max-w-3xl">
            Democracy Monitor reads government documents published in the Federal Register and
            analyzes them using three-layer triangulated detection: structural anomaly analysis, AI
            document assessment, and thematic drift monitoring. Unlike expert opinion indices, every
            assessment traces to specific documents and reproducible metrics. The methodology is
            open source.
          </p>
        </section>

        {/* Source health summary bar */}
        {healthSummary && healthSummary.totalSources > 0 && (
          <SourceHealthBar
            healthySources={healthSummary.healthySources}
            degradedSources={healthSummary.degradedSources}
            unavailableSources={healthSummary.unavailableSources}
            silentSources={healthSummary.silentSources}
            totalSources={healthSummary.totalSources}
            lastCheckedAt={lastCheckedAt}
          />
        )}

        {/* Overview section — only shown when overview data is available */}
        {overview && (
          <div className="space-y-8 mb-8">
            {/* Status distribution */}
            <section>
              <h2 className="text-sm font-semibold text-dm-text-primary mb-1">
                Status Distribution
              </h2>
              {statusRangeLabel && (
                <p className="text-[11px] text-dm-muted mb-3">{statusRangeLabel}</p>
              )}
              <OverviewStatusSummary statusCounts={filteredStatusCounts} />
            </section>

            {/* Time range controls + elevated categories chart */}
            <section>
              <div className="flex items-center justify-between mb-1">
                <div>
                  <h2 className="text-sm font-semibold text-dm-text-primary">
                    Elevated Categories Over Time
                  </h2>
                  <p className="text-[11px] text-dm-muted mt-0.5">
                    Number of categories at Elevated or above per week
                  </p>
                </div>
                <TimeRangeSelector selected={rangePreset} onChange={handlePresetChange} />
              </div>
              <SynchronyChart
                data={overview.synchrony}
                mode={resolvedMode}
                brushStartIndex={activeRange?.start}
                brushEndIndex={activeRange?.end}
                onRangeChange={handleBrushChange}
              />
            </section>

            {/* Status heatmap */}
            <section>
              <h2 className="text-sm font-semibold text-dm-text-primary mb-1">Status Heatmap</h2>
              <p className="text-[11px] text-dm-muted mb-3">
                Convergence status per category over time
              </p>
              <StatusTimeline
                entries={filteredOverview?.statusTimeline ?? []}
                mode={resolvedMode}
                onCellClick={handleCellClick}
              />
            </section>
          </div>
        )}

        {/* Category table */}
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-dm-text-primary mb-1">Categories</h2>
          <p className="text-[11px] text-dm-muted mb-3">
            Latest week scores and 8-week sparkline trends
          </p>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: CATEGORIES.length }, (_, i) => (
                <div
                  key={i}
                  className="rounded border border-dm-border bg-dm-card h-10 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <CategoryTable categories={categories} readingLevel={readingLevel} />
          )}
        </section>

        <MethodologyFooter />
      </main>
    </>
  );
}
