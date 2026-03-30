import { useRouter } from 'next/router';
import { useCallback, useMemo, useState } from 'react';
import { CategoryTable } from '@/components/landing/CategoryTable';
import { DataIntegrityBanner } from '@/components/landing/DataIntegrityBanner';
import { TimeRangeBar } from '@/components/landing/TimeRangeBar';
import { WeekNavigator } from '@/components/landing/WeekNavigator';
import { EmbedButton } from '@/components/overview/EmbedButton';
import { OverviewStatusSummary } from '@/components/overview/OverviewStatusSummary';
import { StatusTimeline } from '@/components/overview/StatusTimeline';
import { SynchronyChart } from '@/components/overview/SynchronyChart';
import type { TimeRangePreset } from '@/components/overview/TimeRangeSelector';
import { presetToWeekCount } from '@/components/overview/TimeRangeSelector';
import { EmailSignup } from '@/components/shared/EmailSignup';
import { WebSiteJsonLd } from '@/components/shared/JsonLd';
import { NarrativeSection } from '@/components/shared/NarrativeSection';
import { SEOHead } from '@/components/shared/SEOHead';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { CATEGORIES } from '@/lib/data/categories';
import { keyToSlug } from '@/lib/data/category-slugs';
import { useDashboardData } from '@/lib/hooks/useDashboardData';
import { useLandingNarratives } from '@/lib/hooks/useLandingNarratives';
import { useWeekSelection } from '@/lib/hooks/useWeekSelection';
import type { ConcernLevel } from '@/lib/types';
import { formatWeekLabel } from '@/lib/utils/date-utils';

export default function Home() {
  const router = useRouter();
  const { readingLevel } = useReadingLevel();
  const { resolvedMode } = useTheme();
  const { categories, overview, meta, healthSummary, loading } = useDashboardData();

  const [rangePreset, setRangePreset] = useState<TimeRangePreset>('all');
  const [brushRange, setBrushRange] = useState<{ start: number; end: number } | null>(null);

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
    const counts: Record<ConcernLevel, number> = {
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

  // Week selection (available weeks derived from filtered heatmap)
  const filteredWeeks = useMemo(() => {
    if (!filteredOverview?.statusTimeline.length) return [];
    return filteredOverview.statusTimeline[0].segments.map((s) => s.week);
  }, [filteredOverview]);

  const {
    selectedWeek,
    weekLoading,
    displayedCategories,
    availableWeeks,
    handleWeekHeaderClick,
    handleWeekChange,
  } = useWeekSelection(categories, filteredWeeks);

  // Narrative data (term summary + weekly overview)
  const latestWeek = useMemo(() => {
    if (!filteredWeeks.length) return null;
    return filteredWeeks[filteredWeeks.length - 1];
  }, [filteredWeeks]);

  const {
    termNarrative,
    termNarrativeLoading,
    termEditorial,
    weeklyNarrative,
    weeklyNarrativeLoading,
    weeklyEditorial,
  } = useLandingNarratives(latestWeek, selectedWeek);

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

  // Compute range start/end week dates from the filtered heatmap segments
  const rangeDates = useMemo(() => {
    if (!filteredOverview?.statusTimeline.length) return null;
    const segs = filteredOverview.statusTimeline[0].segments;
    const first = segs[0]?.week;
    const last = segs[segs.length - 1]?.week;
    if (!first || !last) return null;
    return { from: first, to: last };
  }, [filteredOverview]);

  // Heatmap cell click → category page with context
  const handleCellClick = useCallback(
    (category: string, week: string) => {
      const params = new URLSearchParams({ weekOf: week });
      if (rangeDates) {
        params.set('from', rangeDates.from);
        params.set('to', rangeDates.to);
      }
      router.push(`/category/${keyToSlug(category)}?${params.toString()}`);
    },
    [router, rangeDates],
  );

  // Query string for category table links
  const linkParams = useMemo(() => {
    const params = new URLSearchParams();
    const displayWeek = selectedWeek ?? filteredWeeks[filteredWeeks.length - 1];
    if (displayWeek) params.set('weekOf', displayWeek);
    if (rangeDates) {
      params.set('from', rangeDates.from);
      params.set('to', rangeDates.to);
    }
    const qs = params.toString();
    return qs ? `?${qs}` : '';
  }, [selectedWeek, filteredWeeks, rangeDates]);

  return (
    <>
      <SEOHead
        title="Democracy Monitor"
        description="Automated, transparent analysis of U.S. government documents tracking institutional health across 14 categories."
        canonicalPath="/"
      />
      <WebSiteJsonLd />
      <main>
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
            Democracy Monitor gathers government documents from a variety of sources to assess all
            three branches of government — the executive, the legislative, and the judiciary. It
            uses three-layer triangulated detection: structural anomaly analysis, AI document
            assessment, and thematic drift monitoring. Unlike expert opinion indices, every
            assessment traces to specific documents and reproducible metrics. The methodology is
            open source.
          </p>
        </section>

        <EmailSignup variant="card" />

        {/* Overview section — only shown when overview data is available */}
        {overview && (
          <div className="space-y-8 mb-8">
            {/* Global time range bar */}
            <TimeRangeBar
              rangeLabel={statusRangeLabel}
              selected={rangePreset}
              onChange={handlePresetChange}
            />

            {/* Cumulative concern chart */}
            <section>
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h2 className="text-sm font-semibold text-dm-text-primary">
                    Cumulative Concern Score
                  </h2>
                  <p className="text-[11px] text-dm-muted mt-0.5">
                    {readingLevel === 'summary'
                      ? 'Weighted concern score across all categories per week'
                      : 'Concern score stacked by severity: categories at Elevated (1 point each) or Confirmed Concern (2 points)'}
                  </p>
                </div>
                <EmbedButton
                  theme={resolvedMode}
                  range={rangePreset}
                  comparison={overview.synchrony.some(
                    (d) => d.trumpT1Trend != null || d.bidenT1Trend != null,
                  )}
                  readingLevel={readingLevel}
                />
              </div>
              <SynchronyChart
                data={overview.synchrony}
                mode={resolvedMode}
                readingLevel={readingLevel}
                brushStartIndex={activeRange?.start}
                brushEndIndex={activeRange?.end}
                onRangeChange={handleBrushChange}
                selectedWeek={selectedWeek}
                onWeekClick={handleWeekChange}
              />
            </section>

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

            {/* Term summary narrative — both reading levels */}
            <section>
              <h2 className="text-sm font-semibold text-dm-text-primary mb-2">Term Summary</h2>
              <NarrativeSection
                narrative={termNarrative}
                readingLevel={readingLevel}
                loading={termNarrativeLoading}
                editorial={termEditorial}
                placeholder="Term summary narrative coming soon."
              />
            </section>

            {readingLevel === 'detailed' && (
              <>
                {/* Status heatmap */}
                <section>
                  <h2 className="text-sm font-semibold text-dm-text-primary mb-1">
                    Status Heatmap
                  </h2>
                  <p className="text-[11px] text-dm-muted mb-3">
                    Convergence status per category over time
                  </p>
                  <StatusTimeline
                    entries={filteredOverview?.statusTimeline ?? []}
                    mode={resolvedMode}
                    onCellClick={handleCellClick}
                    onWeekHeaderClick={handleWeekHeaderClick}
                    selectedWeek={selectedWeek}
                    linkParams={linkParams}
                  />
                </section>
              </>
            )}

            {/* Weekly overview narrative — both reading levels */}
            {(weeklyNarrative || weeklyNarrativeLoading) && (
              <section>
                <h2 className="text-sm font-semibold text-dm-text-primary mb-2">
                  Weekly Overview
                  {selectedWeek && (
                    <span className="ml-2 text-[11px] font-normal text-dm-muted">
                      Week of {formatWeekLabel(selectedWeek)}
                    </span>
                  )}
                </h2>
                <NarrativeSection
                  narrative={weeklyNarrative}
                  readingLevel={readingLevel}
                  loading={weeklyNarrativeLoading}
                  editorial={weeklyEditorial}
                />
              </section>
            )}
          </div>
        )}

        {/* Category table */}
        <section className="mb-8">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="text-sm font-semibold text-dm-text-primary">Categories</h2>
              <p className="text-[11px] text-dm-muted mt-0.5">
                {selectedWeek
                  ? `Week of ${formatWeekLabel(selectedWeek)}`
                  : 'Latest week scores and 8-week sparkline trends'}
              </p>
            </div>
            {availableWeeks.length > 0 && (
              <WeekNavigator
                availableWeeks={availableWeeks}
                selectedWeek={selectedWeek}
                onWeekChange={handleWeekChange}
              />
            )}
          </div>
          {loading || weekLoading ? (
            <div className="space-y-2">
              {Array.from({ length: CATEGORIES.length }, (_, i) => (
                <div
                  key={i}
                  className="rounded border border-dm-border bg-dm-card h-10 animate-pulse"
                />
              ))}
            </div>
          ) : (
            <CategoryTable
              categories={displayedCategories}
              readingLevel={readingLevel}
              highlightWeek={selectedWeek}
              linkParams={linkParams}
            />
          )}
        </section>
      </main>
    </>
  );
}
