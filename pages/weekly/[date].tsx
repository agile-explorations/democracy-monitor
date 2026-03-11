import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Link from 'next/link';
import { BreadcrumbJsonLd, CollectionJsonLd } from '@/components/shared/JsonLd';
import { NarrativeSection } from '@/components/shared/NarrativeSection';
import { SEOHead } from '@/components/shared/SEOHead';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { keyToSlug } from '@/lib/data/category-slugs';
import type { AdjacentWeek, WeeklyHubPageData } from '@/lib/services/ssr-narrative-data';
import { getWeeklyHubPageData } from '@/lib/services/ssr-narrative-data';
import type { EditorialRecord } from '@/lib/types';
import { formatWeekLabelWithYear } from '@/lib/utils/date-utils';

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://democracymonitor.us';
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface ElevatedCategory {
  key: string;
  title: string;
  status: string;
}

interface PageProps {
  weekOf: string;
  overview: { expert: string; public: string };
  overviewEditorial: EditorialRecord;
  termSummary: { expert: string; public: string };
  termSummaryEditorial: EditorialRecord;
  elevatedCategories: ElevatedCategory[];
  prevWeek: AdjacentWeek | null;
  nextWeek: AdjacentWeek | null;
  publishedAt: string | null;
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const date = ctx.params?.date as string;

  if (!date || !DATE_RE.test(date)) {
    return { notFound: true };
  }

  let data: WeeklyHubPageData | null = null;
  try {
    data = await getWeeklyHubPageData(date);
  } catch (err) {
    console.error(`[weekly SSR] Error fetching ${date}:`, err);
  }

  if (!data) {
    return { notFound: true };
  }

  ctx.res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  return { props: data };
};

const STATUS_LABELS: Record<string, string> = {
  Elevated: 'Elevated',
  Divergent: 'Divergent',
  ConfirmedConcern: 'Confirmed Concern',
};

const STATUS_COLORS: Record<string, string> = {
  Elevated: 'text-yellow-600 dark:text-yellow-400',
  Divergent: 'text-orange-600 dark:text-orange-400',
  ConfirmedConcern: 'text-red-600 dark:text-red-400',
};

export default function WeeklyHubPage({
  weekOf,
  overview,
  overviewEditorial,
  termSummary,
  termSummaryEditorial,
  elevatedCategories,
  prevWeek,
  nextWeek,
  publishedAt,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { readingLevel } = useReadingLevel();
  const weekLabel = formatWeekLabelWithYear(weekOf);

  // Build collection items for JSON-LD (elevated category-week pages)
  const collectionItems = elevatedCategories.map((cat) => ({
    name: `${cat.title} — Week of ${weekLabel}`,
    url: `${SITE_URL}/category/${keyToSlug(cat.key)}/week/${weekOf}`,
  }));

  return (
    <>
      <SEOHead
        title={`Weekly Summary — ${weekLabel}`}
        description={`Democracy Monitor weekly assessment summary for the week of ${weekLabel}. Cross-category institutional health analysis.`}
        canonicalPath={`/weekly/${weekOf}`}
        ogType="article"
        publishedAt={publishedAt}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Overview', path: '/' },
          { name: `Week of ${weekLabel}`, path: `/weekly/${weekOf}` },
        ]}
      />
      <CollectionJsonLd
        name={`Weekly Summary — ${weekLabel}`}
        description={`Democracy Monitor weekly assessment summary for the week of ${weekLabel}.`}
        canonicalPath={`/weekly/${weekOf}`}
        items={collectionItems}
        publishedAt={publishedAt}
      />

      {/* Breadcrumb */}
      <nav className="text-xs text-dm-muted space-x-1">
        <Link href="/" className="text-dm-accent hover:underline">
          Overview
        </Link>
        <span>&rsaquo;</span>
        <span className="text-dm-text-secondary">Week of {weekLabel}</span>
      </nav>

      {/* Header */}
      <header className="mt-4 mb-6">
        <h1 className="text-lg font-bold text-dm-text-primary">Weekly Summary — {weekLabel}</h1>
      </header>

      {/* Weekly overview narrative */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-dm-text-primary mb-2">Weekly Overview</h2>
        <NarrativeSection
          narrative={overview}
          readingLevel={readingLevel}
          editorial={overviewEditorial}
        />
      </section>

      {/* Elevated categories */}
      {elevatedCategories.length > 0 && (
        <section className="mb-8">
          <h2 className="text-sm font-semibold text-dm-text-primary mb-2">Categories of Concern</h2>
          <div className="rounded-lg border border-dm-border bg-dm-card p-4">
            <ul className="space-y-2">
              {elevatedCategories.map((cat) => {
                const catSlug = keyToSlug(cat.key);
                return (
                  <li key={cat.key} className="flex items-center justify-between text-sm">
                    <div className="space-x-3">
                      <Link
                        href={`/category/${catSlug}/week/${weekOf}`}
                        className="text-dm-accent hover:underline"
                      >
                        {cat.title}
                      </Link>
                      <Link
                        href={`/category/${catSlug}`}
                        className="text-dm-muted hover:underline text-xs"
                      >
                        overview
                      </Link>
                    </div>
                    <span
                      className={`text-xs font-medium ${STATUS_COLORS[cat.status] ?? 'text-dm-muted'}`}
                    >
                      {STATUS_LABELS[cat.status] ?? cat.status}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </section>
      )}

      {/* Term summary */}
      <section className="mb-8">
        <h2 className="text-sm font-semibold text-dm-text-primary mb-2">
          Term Summary
          <span className="ml-2 text-[11px] font-normal text-dm-muted">as of {weekLabel}</span>
        </h2>
        <NarrativeSection
          narrative={termSummary}
          readingLevel={readingLevel}
          editorial={termSummaryEditorial}
        />
      </section>

      {/* Prev/next navigation */}
      <nav className="flex items-center justify-between mb-6 py-3 border-t border-dm-border">
        <div>
          {prevWeek && (
            <Link
              href={`/weekly/${prevWeek.weekOf}`}
              className="text-dm-accent hover:underline text-xs"
            >
              Previous: Week of {formatWeekLabelWithYear(prevWeek.weekOf)}
            </Link>
          )}
        </div>
        <div>
          {nextWeek && (
            <Link
              href={`/weekly/${nextWeek.weekOf}`}
              className="text-dm-accent hover:underline text-xs"
            >
              Next: Week of {formatWeekLabelWithYear(nextWeek.weekOf)}
            </Link>
          )}
        </div>
      </nav>

      {/* Link back to interactive dashboard */}
      <p className="text-xs text-dm-muted">
        <Link href="/" className="text-dm-accent hover:underline">
          &larr; Back to interactive dashboard
        </Link>
      </p>
    </>
  );
}
