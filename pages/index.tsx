import { useRouter } from 'next/router';
import { useCallback, useMemo, useState } from 'react';
import { CategoryTable } from '@/components/landing/CategoryTable';
import { DataIntegrityBanner } from '@/components/landing/DataIntegrityBanner';
import { ThisWeekStrip } from '@/components/landing/ThisWeekStrip';
import { TimeRangeBar } from '@/components/landing/TimeRangeBar';
import { WeekNavigator } from '@/components/landing/WeekNavigator';
import { EmbedButton } from '@/components/overview/EmbedButton';
import { OverviewStatusSummary } from '@/components/overview/OverviewStatusSummary';
import { SignificantWeeksList } from '@/components/overview/SignificantWeeksList';
import { StatusTimeline } from '@/components/overview/StatusTimeline';
import { SynchronyChart } from '@/components/overview/SynchronyChart';
import type { TimeRangePreset } from '@/components/overview/TimeRangeSelector';
import { presetToWeekCount } from '@/components/overview/TimeRangeSelector';
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
import { formatWeekLabel, formatWeekLabelWithYear } from '@/lib/utils/date-utils';
import { formatApproxCount } from '@/lib/utils/math';

export default function Home() {
  const router = useRouter();
  const { readingLevel } = useReadingLevel();
  const { resolvedMode } = useTheme();
  const { categories, overview, meta, healthSummary, fetchTimeline, documentCount, loading } =
    useDashboardData();

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
    termWeekOf,
    termNarrativeLoading,
    termEditorial,
    significantWeeks,
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
        description="A searchable repository of U.S. government documents with AI-assisted analyses of democratic institutional health across 14 categories."
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

        {/* Positioning statement — one line; full copy in the About expander */}
        <section className="mb-4">
          <p className="text-sm text-dm-text-secondary leading-relaxed max-w-3xl">
            AI-assisted analyses of democratic institutional health across 14 categories, grounded
            in a searchable repository of{' '}
            {documentCount ? formatApproxCount(documentCount) : 'over 200,000'} U.S. government
            documents.
          </p>
          <details className="mt-1 max-w-3xl">
            <summary className="text-xs text-dm-accent cursor-pointer hover:underline">
              About this dashboard
            </summary>
            <p className="mt-2 text-sm text-dm-text-secondary leading-relaxed">
              Democracy Monitor is a searchable repository of U.S. government documents — federal
              regulations, court filings, congressional floor speeches, presidential statements,
              enforcement actions, and more. Using this repository, the system produces AI-assisted
              analyses of democratic institutional health across 14 categories, with weekly
              assessments, AI-generated narrative summaries, and the ability to drill down to the
              specific documents supporting each finding. The methodology, data, and code are fully
              open source.
            </p>
          </details>
        </section>

        {/* Current-week status strip (#533) — follows the Categories week selection */}
        <div className="mb-8">
          <ThisWeekStrip
            weekOf={selectedWeek ?? latestWeek}
            isLatestWeek={!selectedWeek || selectedWeek === latestWeek}
            weekLoading={weekLoading}
            categories={displayedCategories}
            synchrony={overview?.synchrony ?? []}
            fetchTimeline={fetchTimeline ?? []}
            significantWeeks={significantWeeks}
          />
        </div>

        {/* Category table */}
        <section id="categories" className="mb-8 group">
          <div className="flex items-center justify-between mb-1">
            <div>
              <h2 className="text-sm font-semibold text-dm-text-primary">
                Categories
                <a
                  href="#categories"
                  className="ml-1 text-dm-muted hover:text-dm-accent opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Link to Categories"
                >
                  #
                </a>
              </h2>
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

        {/* Weekly overview narrative — both reading levels */}
        {(weeklyNarrative || weeklyNarrativeLoading) && (
          <section id="weekly-overview" className="group">
            <h2 className="text-sm font-semibold text-dm-text-primary mb-2">
              Weekly Overview
              <a
                href="#weekly-overview"
                className="ml-1 text-dm-muted hover:text-dm-accent opacity-0 group-hover:opacity-100 transition-opacity"
                aria-label="Link to Weekly Overview"
              >
                #
              </a>
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

        {/* Term-context divider (#533): everything below is term-scale context */}
        <div className="mt-10 mb-6 flex items-center gap-3" aria-hidden>
          <hr className="flex-1 border-dm-border" />
          <span className="text-[11px] uppercase tracking-wider text-dm-muted">Term so far</span>
          <hr className="flex-1 border-dm-border" />
        </div>

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
            <section id="concern-score" className="group">
              <div className="flex items-start justify-between mb-1">
                <div>
                  <h2 className="text-sm font-semibold text-dm-text-primary">
                    Cumulative Concern Score
                    <a
                      href="#concern-score"
                      className="ml-1 text-dm-muted hover:text-dm-accent opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Link to Cumulative Concern Score"
                    >
                      #
                    </a>
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
              {selectedWeek && selectedWeek !== latestWeek ? (
                <div className="flex items-center justify-between mt-2 px-3 py-1.5 rounded-md bg-dm-accent/10 border border-dm-accent/20">
                  <span className="text-xs text-dm-accent font-medium">
                    Viewing week of {formatWeekLabel(selectedWeek)}
                  </span>
                  <button
                    onClick={() => latestWeek && handleWeekChange(latestWeek)}
                    className="text-[10px] text-dm-muted hover:text-dm-text-secondary"
                  >
                    Back to latest
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-dm-muted mt-1.5 text-center">
                  Click any week on the chart to explore
                </p>
              )}
            </section>

            {/* Status distribution */}
            <section id="status-distribution" className="group">
              <h2 className="text-sm font-semibold text-dm-text-primary mb-1">
                Status Distribution
                <a
                  href="#status-distribution"
                  className="ml-1 text-dm-muted hover:text-dm-accent opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Link to Status Distribution"
                >
                  #
                </a>
              </h2>
              {statusRangeLabel && (
                <p className="text-[11px] text-dm-muted mb-3">{statusRangeLabel}</p>
              )}
              <OverviewStatusSummary statusCounts={filteredStatusCounts} />
            </section>

            {/* Living term summary — both reading levels */}
            <section id="term-summary" className="group">
              <h2 className="text-sm font-semibold text-dm-text-primary mb-2">
                Term Summary
                {termWeekOf && (
                  <span className="ml-2 text-[11px] font-normal text-dm-muted">
                    as of {formatWeekLabelWithYear(termWeekOf)}
                  </span>
                )}
                <a
                  href="#term-summary"
                  className="ml-1 text-dm-muted hover:text-dm-accent opacity-0 group-hover:opacity-100 transition-opacity"
                  aria-label="Link to Term Summary"
                >
                  #
                </a>
              </h2>
              <NarrativeSection
                narrative={termNarrative}
                readingLevel={readingLevel}
                loading={termNarrativeLoading}
                editorial={termEditorial}
                placeholder="Term summary narrative coming soon."
                defaultCollapsed
              />
              <SignificantWeeksList weeks={significantWeeks} />
            </section>

            {readingLevel === 'detailed' && (
              <>
                {/* Status heatmap */}
                <section id="status-heatmap" className="group">
                  <h2 className="text-sm font-semibold text-dm-text-primary mb-1">
                    Status Heatmap
                    <a
                      href="#status-heatmap"
                      className="ml-1 text-dm-muted hover:text-dm-accent opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Link to Status Heatmap"
                    >
                      #
                    </a>
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
          </div>
        )}
      </main>
    </>
  );
}
