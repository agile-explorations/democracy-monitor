import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import { CategoryChartCard } from '@/components/category/CategoryChartCard';
import { RangeSummaryPanel } from '@/components/category/RangeSummaryPanel';
import { WeekDetailPanel } from '@/components/category/WeekDetailPanel';
import { WhyThisMattersLine } from '@/components/category/WhyThisMattersLine';
import { TimeRangeBar } from '@/components/landing/TimeRangeBar';
import { WeekNavigator } from '@/components/landing/WeekNavigator';
import { ArchiveItemListJsonLd, BreadcrumbJsonLd } from '@/components/shared/JsonLd';
import { SEOHead } from '@/components/shared/SEOHead';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { CATEGORIES } from '@/lib/data/categories';
import { keyToSlug, slugToKey } from '@/lib/data/category-slugs';
import { useCategoryDetail } from '@/lib/hooks/useCategoryDetail';
import type { CategoryDetailInitialParams } from '@/lib/hooks/useCategoryDetail';
import type { ArchiveWeekEntry } from '@/lib/services/ssr-narrative-data';
import { getNarrativeWeeksForCategory } from '@/lib/services/ssr-narrative-data';
import { formatWeekLabel, formatWeekLabelWithYear } from '@/lib/utils/date-utils';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://democracymonitor.us';
const ARCHIVE_COLLAPSED_COUNT = 12;

const STATUS_LABELS: Record<string, string> = {
  Stable: 'Stable',
  Elevated: 'Elevated',
  ConfirmedConcern: 'Confirmed Concern',
};

const STATUS_COLORS: Record<string, string> = {
  Elevated: 'text-yellow-600 dark:text-yellow-400',
  ConfirmedConcern: 'text-red-600 dark:text-red-400',
};

interface PageProps {
  archiveWeeks: ArchiveWeekEntry[];
  /** Category key resolved from slug, for SSR data */
  resolvedKey: string | null;
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const slug = ctx.params?.key as string;
  if (!slug) return { props: { archiveWeeks: [], resolvedKey: null } };

  const categoryKey = slugToKey(slug) ?? slug;
  const category = CATEGORIES.find((c) => c.key === categoryKey);
  if (!category) return { props: { archiveWeeks: [], resolvedKey: null } };

  let archiveWeeks: ArchiveWeekEntry[] = [];
  try {
    archiveWeeks = await getNarrativeWeeksForCategory(categoryKey);
  } catch (err) {
    console.error(`[category landing] Archive query failed for ${categoryKey}:`, err);
  }

  return { props: { archiveWeeks, resolvedKey: categoryKey } };
};

export default function CategoryDetailPage({
  archiveWeeks,
  resolvedKey,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { key, weekOf, from, to } = router.query;
  const rawKey = typeof key === 'string' ? key : undefined;
  const categoryKey = rawKey ? (slugToKey(rawKey) ?? rawKey) : undefined;
  const { readingLevel } = useReadingLevel();
  const { resolvedMode } = useTheme();

  // SSR-resolved category info (available before client-side data loads)
  const ssrCategory = useMemo(
    () => CATEGORIES.find((c) => c.key === (resolvedKey ?? categoryKey)),
    [resolvedKey, categoryKey],
  );
  const ssrSlug = keyToSlug(resolvedKey ?? categoryKey ?? '');
  const ssrTitle = ssrCategory?.title ?? '';

  const initialParams = useMemo<CategoryDetailInitialParams | undefined>(() => {
    const w = typeof weekOf === 'string' ? weekOf : undefined;
    const f = typeof from === 'string' ? from : undefined;
    const t = typeof to === 'string' ? to : undefined;
    if (!w && !f && !t) return undefined;
    return { weekOf: w, from: f, to: t };
  }, [weekOf, from, to]);

  const {
    weeklyData,
    title,
    rangePreset,
    brushStartIndex,
    brushEndIndex,
    rangeLabel,
    selectedWeek,
    weekData,
    weekLoading,
    setRangePreset,
    setBrushRange,
    selectWeek,
    loading,
  } = useCategoryDetail(categoryKey, initialParams);

  const availableWeeks = useMemo(() => weeklyData.map((r) => r.weekOf), [weeklyData]);
  const category = useMemo(() => CATEGORIES.find((c) => c.key === categoryKey), [categoryKey]);

  // Archive expansion state
  const [archiveExpanded, setArchiveExpanded] = useState(false);
  const visibleArchive = archiveExpanded
    ? archiveWeeks
    : archiveWeeks.slice(0, ARCHIVE_COLLAPSED_COUNT);

  // When viewing a specific week via query params, point crawlers to the SSR canonical page
  const weekOfParam = typeof weekOf === 'string' ? weekOf : undefined;
  const slug = ssrSlug;
  const hasWeekParam = !!weekOfParam;
  const displayTitle = title || ssrTitle;

  // JSON-LD archive items (uses SSR-available data)
  const archiveItems = archiveWeeks.map((w) => ({
    name: `${ssrTitle} — Week of ${formatWeekLabelWithYear(w.weekOf)}`,
    url: `${SITE_URL}/category/${slug}/week/${w.weekOf}`,
  }));

  if (!loading && !title) {
    return (
      <>
        <Link href="/" className="text-xs text-dm-accent hover:underline">
          &larr; Back to overview
        </Link>
        <p className="mt-8 text-sm text-dm-text-secondary">Category not found.</p>
      </>
    );
  }

  const latestRow = weeklyData[weeklyData.length - 1];

  return (
    <>
      {/* SEO + structured data — always rendered (SSR-critical) */}
      <SEOHead
        title={displayTitle}
        description={
          ssrCategory
            ? `${ssrCategory.expertDescription ?? ssrCategory.description} Track weekly assessments and institutional health trends.`
            : `${displayTitle} institutional health tracking.`
        }
        canonicalPath={hasWeekParam ? `/category/${slug}/week/${weekOfParam}` : `/category/${slug}`}
        noindex={hasWeekParam}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Overview', path: '/' },
          { name: displayTitle, path: `/category/${slug}` },
        ]}
      />
      {archiveItems.length > 0 && <ArchiveItemListJsonLd items={archiveItems} />}

      {/* Back link */}
      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      {/* Header */}
      <header className="mt-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-dm-text-primary">{displayTitle}</h2>
          <p className="text-xs text-dm-text-secondary mt-1">
            {readingLevel === 'detailed' && <span className="font-mono mr-2">{categoryKey}</span>}
            {latestRow && <>{Number(latestRow.documentCount)} docs latest week</>}
          </p>
        </div>
        {(category || ssrCategory) && (
          <p className="text-sm text-dm-text-secondary mt-3 max-w-3xl leading-relaxed">
            {readingLevel === 'detailed'
              ? (category ?? ssrCategory)!.expertDescription
              : (category ?? ssrCategory)!.description}
          </p>
        )}
        <WhyThisMattersLine categoryKey={categoryKey ?? ''} />
        <p className="text-xs mt-3 space-x-3">
          <Link
            href={`/feedback?category=${categoryKey}`}
            className="text-dm-accent hover:underline"
          >
            Know of a government action in this category that we missed? Tell us.
          </Link>
          {readingLevel === 'detailed' && (
            <Link
              href="/system/methodology#ai-prompt-transparency"
              className="text-dm-accent hover:underline"
            >
              View the AI prompts used to assess this category
            </Link>
          )}
        </p>
      </header>

      {loading && (
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-dm-border/50 rounded" />
          <div className="h-[320px] bg-dm-border/30 rounded-lg" />
          <div className="h-32 bg-dm-border/30 rounded-lg" />
        </div>
      )}

      {/* Interactive content — client-side loaded */}
      {!loading && (
        <>
          {/* Time range bar */}
          <TimeRangeBar rangeLabel={rangeLabel} selected={rangePreset} onChange={setRangePreset} />

          {/* Status-over-time chart */}
          <CategoryChartCard
            data={weeklyData}
            mode={resolvedMode}
            brushStartIndex={brushStartIndex}
            brushEndIndex={brushEndIndex}
            onRangeChange={setBrushRange}
            selectedWeek={selectedWeek}
            onWeekClick={selectWeek}
          />
          {selectedWeek && selectedWeek !== latestRow?.weekOf ? (
            <div className="flex items-center justify-between mt-2 mb-4 px-3 py-1.5 rounded-md bg-dm-accent/10 border border-dm-accent/20">
              <span className="text-xs text-dm-accent font-medium">
                Viewing week of {formatWeekLabel(selectedWeek)}
              </span>
              <button
                onClick={() => latestRow && selectWeek(latestRow.weekOf)}
                className="text-[10px] text-dm-muted hover:text-dm-text-secondary"
              >
                Back to latest
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-dm-muted mt-1.5 mb-4 text-center">
              Click any week on the chart to explore
            </p>
          )}

          {/* Range summary */}
          {weeklyData.length > 0 && (
            <div className="mb-6">
              <RangeSummaryPanel
                weeklyData={weeklyData}
                startIndex={brushStartIndex ?? 0}
                endIndex={brushEndIndex ?? weeklyData.length - 1}
              />
            </div>
          )}

          {/* Week detail — shown when a week is selected */}
          {selectedWeek && categoryKey && (
            <div className="mt-8 pt-6 border-t border-dm-border">
              <div className="flex items-center justify-end mb-4">
                <WeekNavigator
                  availableWeeks={availableWeeks}
                  selectedWeek={selectedWeek}
                  onWeekChange={selectWeek}
                />
              </div>
              <WeekDetailPanel
                weekOf={selectedWeek}
                categoryKey={categoryKey}
                layers={weekData?.layers ?? null}
                explanation={weekData?.explanation ?? null}
                narrative={weekData?.narrative ?? null}
                editorial={weekData?.editorial ?? null}
                readingLevel={readingLevel}
                loading={weekLoading}
                onClose={() => selectWeek(null)}
              />
            </div>
          )}
        </>
      )}

      {/* Week archive — server-rendered for crawlers */}
      {archiveWeeks.length > 0 && (
        <section id="week-archive" className="mt-8 pt-6 border-t border-dm-border group">
          <h2 className="text-sm font-semibold text-dm-text-primary mb-3">
            Week Archive
            <a
              href="#week-archive"
              className="ml-1 text-dm-muted hover:text-dm-accent opacity-0 group-hover:opacity-100 transition-opacity"
              aria-label="Link to Week Archive"
            >
              #
            </a>
            <span className="ml-2 text-[11px] font-normal text-dm-muted">
              {archiveWeeks.length} weeks with narratives
            </span>
          </h2>
          <ul className="space-y-1">
            {visibleArchive.map((w) => {
              const label = formatWeekLabelWithYear(w.weekOf);
              const statusLabel = w.status ? (STATUS_LABELS[w.status] ?? w.status) : null;
              const statusColor = w.status ? (STATUS_COLORS[w.status] ?? '') : '';
              return (
                <li key={w.weekOf} className="flex items-center justify-between text-sm py-1">
                  <Link
                    href={`/category/${slug}/week/${w.weekOf}`}
                    className="text-dm-accent hover:underline"
                  >
                    Week of {label}
                  </Link>
                  {statusLabel && (
                    <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {archiveWeeks.length > ARCHIVE_COLLAPSED_COUNT && !archiveExpanded && (
            <button
              onClick={() => setArchiveExpanded(true)}
              className="mt-2 text-xs text-dm-accent hover:underline"
            >
              Show all {archiveWeeks.length} weeks
            </button>
          )}
        </section>
      )}
    </>
  );
}
