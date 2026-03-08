import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useMemo } from 'react';
import { CategoryStatusChart } from '@/components/category/CategoryStatusChart';
import { RangeSummaryPanel } from '@/components/category/RangeSummaryPanel';
import { WeekDetailPanel } from '@/components/category/WeekDetailPanel';
import { TimeRangeBar } from '@/components/landing/TimeRangeBar';
import { WeekNavigator } from '@/components/landing/WeekNavigator';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { CATEGORIES } from '@/lib/data/categories';
import { useCategoryDetail } from '@/lib/hooks/useCategoryDetail';
import type { CategoryDetailInitialParams } from '@/lib/hooks/useCategoryDetail';

export default function CategoryDetailPage() {
  const router = useRouter();
  const { key, weekOf, from, to } = router.query;
  const categoryKey = typeof key === 'string' ? key : undefined;
  const { readingLevel } = useReadingLevel();
  const { resolvedMode } = useTheme();

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

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 w-64 bg-dm-border/50 rounded" />
        <div className="h-[320px] bg-dm-border/30 rounded-lg" />
        <div className="h-32 bg-dm-border/30 rounded-lg" />
      </div>
    );
  }

  if (!title) {
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
      <Head>
        <title>{title} — Democracy Monitor</title>
      </Head>

      {/* Back link */}
      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      {/* Header */}
      <header className="mt-4 mb-6">
        <div>
          <h2 className="text-lg font-bold text-dm-text-primary">{title}</h2>
          <p className="text-xs text-dm-text-secondary mt-1">
            {readingLevel === 'detailed' && <span className="font-mono mr-2">{categoryKey}</span>}
            {latestRow && <>{Number(latestRow.documentCount)} docs latest week</>}
          </p>
        </div>
        {category && (
          <p className="text-sm text-dm-text-secondary mt-3 max-w-3xl leading-relaxed">
            {readingLevel === 'detailed' ? category.expertDescription : category.description}
          </p>
        )}
      </header>

      {/* Time range bar */}
      <TimeRangeBar rangeLabel={rangeLabel} selected={rangePreset} onChange={setRangePreset} />

      {/* Status-over-time chart */}
      <div className="rounded-lg border border-dm-border bg-dm-card p-5 mb-6">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
          Convergence Score Over Time
        </h2>
        <CategoryStatusChart
          data={weeklyData}
          mode={resolvedMode}
          brushStartIndex={brushStartIndex}
          brushEndIndex={brushEndIndex}
          onRangeChange={setBrushRange}
          selectedWeek={selectedWeek}
          onWeekClick={selectWeek}
        />
      </div>

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
  );
}
