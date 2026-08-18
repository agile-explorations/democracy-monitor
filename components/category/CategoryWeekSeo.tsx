import { ArticleJsonLd, BreadcrumbJsonLd } from '@/components/shared/JsonLd';
import { SEOHead } from '@/components/shared/SEOHead';
import type { CategoryWeekPageData } from '@/lib/services/ssr-narrative-data';
import { formatWeekLabelWithYear } from '@/lib/utils/date-utils';

/**
 * SEO head + structured data for the week-path form of the unified category
 * route (#733) — preserves the retired standalone week page's canonical URL,
 * article markup, and published date, so indexed week URLs keep their
 * search-result identity.
 */
export function CategoryWeekSeo({
  ssrWeek,
  slug,
}: {
  ssrWeek: CategoryWeekPageData;
  slug: string;
}) {
  const weekLabel = formatWeekLabelWithYear(ssrWeek.weekOf);
  const canonicalPath = `/category/${slug}/week/${ssrWeek.weekOf}`;
  return (
    <>
      <SEOHead
        title={`${ssrWeek.categoryTitle} — Week of ${weekLabel}`}
        description={`${ssrWeek.categoryTitle} institutional health assessment for the week of ${weekLabel}. ${ssrWeek.categoryDescription}`}
        canonicalPath={canonicalPath}
        ogType="article"
        publishedAt={ssrWeek.publishedAt}
      />
      <BreadcrumbJsonLd
        items={[
          { name: 'Overview', path: '/' },
          { name: ssrWeek.categoryTitle, path: `/category/${slug}` },
          { name: `Week of ${weekLabel}`, path: canonicalPath },
        ]}
      />
      <ArticleJsonLd
        headline={`${ssrWeek.categoryTitle} — Week of ${weekLabel}`}
        description={`${ssrWeek.categoryTitle} institutional health assessment for the week of ${weekLabel}.`}
        canonicalPath={canonicalPath}
        publishedAt={ssrWeek.publishedAt}
        about={ssrWeek.categoryTitle}
        categoryPath={`/category/${slug}`}
        weeklyPath={`/weekly/${ssrWeek.weekOf}`}
      />
    </>
  );
}
