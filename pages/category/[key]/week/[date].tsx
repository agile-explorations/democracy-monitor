import type { GetServerSideProps, InferGetServerSidePropsType } from 'next';
import Link from 'next/link';
import { ConvergenceHeader } from '@/components/category/ConvergenceHeader';
import { NarrativeSection } from '@/components/shared/NarrativeSection';
import { SEOHead } from '@/components/shared/SEOHead';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { keyToSlug, slugToKey } from '@/lib/data/category-slugs';
import type { CategoryWeekPageData } from '@/lib/services/ssr-narrative-data';
import { getCategoryWeekPageData } from '@/lib/services/ssr-narrative-data';
import type { ConvergenceSynthesis, EditorialRecord } from '@/lib/types';
import { formatWeekLabelWithYear } from '@/lib/utils/date-utils';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Serializable props — dates and JSON objects must be plain. */
interface PageProps {
  categoryKey: string;
  categoryTitle: string;
  categoryDescription: string;
  weekOf: string;
  narrative: { expert: string; public: string };
  editorial: EditorialRecord;
  convergenceStatus: string | null;
  convergenceScore: number | null;
  convergenceDetail: ConvergenceSynthesis | null;
}

export const getServerSideProps: GetServerSideProps<PageProps> = async (ctx) => {
  const slug = ctx.params?.key as string;
  const date = ctx.params?.date as string;

  if (!slug || !date || !DATE_RE.test(date)) {
    return { notFound: true };
  }

  const categoryKey = slugToKey(slug) ?? slug;

  let data: CategoryWeekPageData | null = null;
  try {
    data = await getCategoryWeekPageData(categoryKey, date);
  } catch (err) {
    console.error(`[category-week SSR] Error fetching ${categoryKey}/${date}:`, err);
  }

  if (!data) {
    return { notFound: true };
  }

  ctx.res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  return { props: data };
};

export default function CategoryWeekPage({
  categoryKey,
  categoryTitle,
  categoryDescription,
  weekOf,
  narrative,
  editorial,
  convergenceDetail,
}: InferGetServerSidePropsType<typeof getServerSideProps>) {
  const { readingLevel } = useReadingLevel();
  const slug = keyToSlug(categoryKey);
  const weekLabel = formatWeekLabelWithYear(weekOf);

  return (
    <>
      <SEOHead
        title={`${categoryTitle} — Week of ${weekLabel}`}
        description={`${categoryTitle} institutional health assessment for the week of ${weekLabel}. ${categoryDescription}`}
        canonicalPath={`/category/${slug}/week/${weekOf}`}
      />

      {/* Breadcrumb */}
      <nav className="text-xs text-dm-muted space-x-1">
        <Link href="/" className="text-dm-accent hover:underline">
          Overview
        </Link>
        <span>&rsaquo;</span>
        <Link href={`/category/${slug}`} className="text-dm-accent hover:underline">
          {categoryTitle}
        </Link>
        <span>&rsaquo;</span>
        <span className="text-dm-text-secondary">Week of {weekLabel}</span>
      </nav>

      {/* Header */}
      <header className="mt-4 mb-6">
        <h1 className="text-lg font-bold text-dm-text-primary">
          {categoryTitle} — Week of {weekLabel}
        </h1>
        <p className="text-xs text-dm-text-secondary mt-1">{categoryDescription}</p>
      </header>

      {/* Convergence status */}
      <div className="mb-6">
        <ConvergenceHeader synthesis={convergenceDetail ?? null} />
      </div>

      {/* Narrative */}
      <div className="mb-6">
        <NarrativeSection narrative={narrative} readingLevel={readingLevel} editorial={editorial} />
      </div>

      {/* Link to interactive view */}
      <p className="text-xs text-dm-muted">
        <Link
          href={`/category/${slug}?weekOf=${weekOf}`}
          className="text-dm-accent hover:underline"
        >
          View interactive detail with charts and layer data &rarr;
        </Link>
      </p>
    </>
  );
}
