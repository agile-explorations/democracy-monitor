import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { NarrativeSection } from '@/components/shared/NarrativeSection';
import { WeekCategoryGrid } from '@/components/week/WeekCategoryGrid';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { useWeekOverview } from '@/lib/hooks/useWeekOverview';

function formatWeekDate(date: string): string {
  const d = new Date(date + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

export default function WeekOverviewPage() {
  const router = useRouter();
  const { date } = router.query;
  const weekDate = typeof date === 'string' ? date : undefined;
  const { readingLevel } = useReadingLevel();

  const { categorySummaries, overviewNarrative, loading } = useWeekOverview(weekDate);

  if (loading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-4 w-48 bg-dm-border/50 rounded" />
        <div className="h-8 w-64 bg-dm-border/50 rounded" />
        <div className="grid grid-cols-3 gap-3">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-20 bg-dm-border/30 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>Week of {formatWeekDate(String(date))} — Democracy Monitor</title>
      </Head>

      {/* Back link */}
      <Link href="/" className="text-xs text-dm-accent hover:underline">
        &larr; Back to overview
      </Link>

      {/* Header */}
      <header className="mt-4 mb-6">
        <h2 className="text-lg font-bold text-dm-text-primary">
          Week of {formatWeekDate(String(date))}
        </h2>
        <p className="text-xs text-dm-text-secondary mt-1">All categories</p>
      </header>

      {/* Category status grid */}
      {categorySummaries.length > 0 && (
        <div className="mb-6">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-dm-text-secondary mb-3">
            All Categories This Week
          </h3>
          <WeekCategoryGrid summaries={categorySummaries} weekOf={String(date)} />
        </div>
      )}

      {/* Overview narrative */}
      <div className="mb-6">
        <NarrativeSection narrative={overviewNarrative} readingLevel={readingLevel} />
      </div>
    </>
  );
}
