import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useCallback, useEffect, useMemo } from 'react';
import { CategoryChartCard } from '@/components/category/CategoryChartCard';
import { CategoryWeekSeo } from '@/components/category/CategoryWeekSeo';
import { LitigationPanel } from '@/components/category/LitigationPanel';
import { RangeSummaryPanel } from '@/components/category/RangeSummaryPanel';
import { StaticWeekContent } from '@/components/category/StaticWeekContent';
import { WeekArchiveSection } from '@/components/category/WeekArchiveSection';
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
import type { ArchiveWeekEntry, CategoryWeekPageData } from '@/lib/services/ssr-narrative-data';
import {
  getCategoryWeekPageData,
  getNarrativeWeeksForCategory,
} from '@/lib/services/ssr-narrative-data';
import { formatWeekLabel, formatWeekLabelWithYear } from '@/lib/utils/date-utils';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://democracymonitor.us';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Unified category route (#733): one optional-catch-all page serves both
 * /category/[key] and /category/[key]/week/[date], so selecting a week (chart
 * click or arrows) shallow-updates the URL without remounting, and a shared
 * week URL restores the FULL interactive display (chart, range summary, week
 * detail) pinned to that week. The former standalone week page's SEO surface
 * (canonical, article markup, server-rendered narrative) is preserved via
 * CategoryWeekSeo + StaticWeekContent.
 */

/** Parse the optional catch-all: [] → landing; ['week', date] → week view. */
function parseRest(rest: string[] | undefined): { weekDate: string | null; valid: boolean } {
  if (!rest || rest.length === 0) return { weekDate: null, valid: true };
  if (rest.length === 2 && rest[0] === 'week' && DATE_RE.test(rest[1])) {
    return { weekDate: rest[1], valid: true };
  }
  return { weekDate: null, valid: false };
}

interface PageProps {
  archiveWeeks: ArchiveWeekEntry[];
  resolvedKey: string | null;
  /** SSR week data when the URL is the week-path form; null on the landing form. */
  ssrWeek: CategoryWeekPageData | null;
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const slug = ctx.params?.key as string;
  const { weekDate, valid } = parseRest(ctx.params?.rest as string[] | undefined);
  if (!slug || !valid) return { notFound: true };

  const categoryKey = slugToKey(slug) ?? slug;
  const category = CATEGORIES.find((c) => c.key === categoryKey);
  if (!category) {
    return weekDate
      ? { notFound: true }
      : { props: { archiveWeeks: [], resolvedKey: null, ssrWeek: null } };
  }

  let ssrWeek: CategoryWeekPageData | null = null;
  if (weekDate) {
    try {
      ssrWeek = await getCategoryWeekPageData(categoryKey, weekDate);
    } catch (err) {
      console.error(`[category-week SSR] Error fetching ${categoryKey}/${weekDate}:`, err);
    }
    if (!ssrWeek) return { notFound: true };
    ctx.res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  }

  let archiveWeeks: ArchiveWeekEntry[] = [];
  try {
    archiveWeeks = await getNarrativeWeeksForCategory(categoryKey);
  } catch (err) {
    console.error(`[category landing] Archive query failed for ${categoryKey}:`, err);
  }

  return { props: { archiveWeeks, resolvedKey: categoryKey, ssrWeek } };
};

export default function CategoryDetailPage({
  archiveWeeks,
  resolvedKey,
  ssrWeek,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const router = useRouter();
  const { key, rest, weekOf, from, to } = router.query;
  const rawKey = typeof key === 'string' ? key : undefined;
  const categoryKey = rawKey ? (slugToKey(rawKey) ?? rawKey) : undefined;
  const { readingLevel } = useReadingLevel();
  const { resolvedMode } = useTheme();

  // Week from the URL path (updates on shallow nav + back/forward)
  const { weekDate: urlWeek } = parseRest(Array.isArray(rest) ? rest : undefined);

  const ssrCategory = useMemo(
    () => CATEGORIES.find((c) => c.key === (resolvedKey ?? categoryKey)),
    [resolvedKey, categoryKey],
  );
  const slug = keyToSlug(resolvedKey ?? categoryKey ?? '');
  const ssrTitle = ssrCategory?.title ?? '';

  const initialParams = useMemo<CategoryDetailInitialParams | undefined>(() => {
    const w = ssrWeek?.weekOf ?? (typeof weekOf === 'string' ? weekOf : undefined);
    const f = typeof from === 'string' ? from : undefined;
    const t = typeof to === 'string' ? to : undefined;
    if (!w && !f && !t) return undefined;
    return { weekOf: w, from: f, to: t };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ssrWeek?.weekOf, weekOf, from, to]);

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
  const latestRow = weeklyData[weeklyData.length - 1];
  const latestWeek = latestRow?.weekOf;

  /** Select a week AND sync the URL (#733): historical weeks get the
   *  shareable /week/ path; latest (or none) returns to the bare path. */
  const handleSelectWeek = useCallback(
    (week: string | null) => {
      selectWeek(week);
      if (!slug) return;
      const target =
        week && week !== latestWeek ? `/category/${slug}/week/${week}` : `/category/${slug}`;
      if (router.asPath.split('?')[0] !== target) {
        void router.push(target, undefined, { shallow: true, scroll: false });
      }
    },
    [selectWeek, slug, latestWeek, router],
  );

  // Back/forward support: when the URL's week segment changes underneath us
  // (popstate), re-select to match. Pushes from handleSelectWeek are no-ops
  // here because selectedWeek already equals the URL week.
  useEffect(() => {
    if (loading) return;
    if (urlWeek && urlWeek !== selectedWeek) selectWeek(urlWeek);
    else if (!urlWeek && selectedWeek && latestWeek && selectedWeek !== latestWeek) {
      selectWeek(latestWeek);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlWeek]);

  const displayTitle = title || ssrTitle;
  const weekOfParam = typeof weekOf === 'string' ? weekOf : undefined;

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

  return (
    <>
      {ssrWeek ? (
        <CategoryWeekSeo ssrWeek={ssrWeek} slug={slug} />
      ) : (
        <>
          <SEOHead
            title={displayTitle}
            description={
              ssrCategory
                ? `${ssrCategory.expertDescription ?? ssrCategory.description} Track weekly assessments and institutional health trends.`
                : `${displayTitle} institutional health tracking.`
            }
            canonicalPath={
              weekOfParam ? `/category/${slug}/week/${weekOfParam}` : `/category/${slug}`
            }
            noindex={!!weekOfParam}
          />
          <BreadcrumbJsonLd
            items={[
              { name: 'Overview', path: '/' },
              { name: displayTitle, path: `/category/${slug}` },
            ]}
          />
        </>
      )}
      {archiveItems.length > 0 && <ArchiveItemListJsonLd items={archiveItems} />}

      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

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

      {/* Pre-hydration + crawler content for week URLs (#733): the retired
          week page's narrative body, server-rendered until the client loads */}
      {loading && ssrWeek && <StaticWeekContent ssrWeek={ssrWeek} slug={slug} />}

      {loading && (
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-64 bg-dm-border/50 rounded" />
          <div className="h-[320px] bg-dm-border/30 rounded-lg" />
          <div className="h-32 bg-dm-border/30 rounded-lg" />
        </div>
      )}

      {!loading && (
        <>
          <TimeRangeBar rangeLabel={rangeLabel} selected={rangePreset} onChange={setRangePreset} />
          <CategoryChartCard
            data={weeklyData}
            mode={resolvedMode}
            brushStartIndex={brushStartIndex}
            brushEndIndex={brushEndIndex}
            onRangeChange={setBrushRange}
            selectedWeek={selectedWeek}
            onWeekClick={handleSelectWeek}
          />
          {selectedWeek && selectedWeek !== latestWeek ? (
            <div className="flex items-center justify-between mt-2 mb-4 px-3 py-1.5 rounded-md bg-dm-accent/10 border border-dm-accent/20">
              <span className="text-xs text-dm-accent font-medium">
                Viewing week of {formatWeekLabel(selectedWeek)}
              </span>
              <button
                onClick={() => latestWeek && handleSelectWeek(latestWeek)}
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

          {weeklyData.length > 0 && (
            <div className="mb-6">
              <RangeSummaryPanel
                weeklyData={weeklyData}
                startIndex={brushStartIndex ?? 0}
                endIndex={brushEndIndex ?? weeklyData.length - 1}
              />
            </div>
          )}

          {selectedWeek && categoryKey && (
            <div className="mt-8 pt-6 border-t border-dm-border">
              <div className="flex items-center justify-end mb-4">
                <WeekNavigator
                  availableWeeks={availableWeeks}
                  selectedWeek={selectedWeek}
                  onWeekChange={handleSelectWeek}
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
                onClose={() => handleSelectWeek(null)}
              />
            </div>
          )}

          {!selectedWeek && categoryKey && <LitigationPanel categoryKey={categoryKey} />}
        </>
      )}

      <WeekArchiveSection archiveWeeks={archiveWeeks} slug={slug} />
    </>
  );
}
