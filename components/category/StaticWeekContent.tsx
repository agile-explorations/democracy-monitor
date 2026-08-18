import Link from 'next/link';
import { ConcernHeader } from '@/components/category/ConcernHeader';
import { NarrativeSection } from '@/components/shared/NarrativeSection';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { CONCERN_LEVEL_LABELS } from '@/lib/data/concern-level-explanations';
import type { AdjacentWeek, CategoryWeekPageData } from '@/lib/services/ssr-narrative-data';
import { formatWeekLabelWithYear } from '@/lib/utils/date-utils';

const STATUS_LABELS: Record<string, string> = CONCERN_LEVEL_LABELS;

/**
 * Server-rendered week content for /category/[key]/week/[date] (#733): the
 * status header, narrative, and adjacent-week links that crawlers (and
 * pre-hydration visitors) see. Once the client loads, the interactive
 * chart + WeekDetailPanel replace this block. Extracted from the retired
 * standalone week page so the unified route keeps its SEO body text.
 */

function AdjacentLink({ week, label, slug }: { week: AdjacentWeek; label: string; slug: string }) {
  const statusLabel = week.status ? (STATUS_LABELS[week.status] ?? week.status) : null;
  return (
    <Link
      href={`/category/${slug}/week/${week.weekOf}`}
      className="text-dm-accent hover:underline text-xs"
    >
      {label}: Week of {formatWeekLabelWithYear(week.weekOf)}
      {statusLabel && <span className="text-dm-muted ml-1">({statusLabel})</span>}
    </Link>
  );
}

export function StaticWeekContent({
  ssrWeek,
  slug,
}: {
  ssrWeek: CategoryWeekPageData;
  slug: string;
}) {
  const { readingLevel } = useReadingLevel();
  return (
    <div className="mb-6">
      <h3 className="text-base font-semibold text-dm-text-primary mb-3">
        Week of {formatWeekLabelWithYear(ssrWeek.weekOf)}
      </h3>
      <div className="mb-6">
        <ConcernHeader synthesis={ssrWeek.convergenceDetail ?? null} />
      </div>
      <div className="mb-6">
        <NarrativeSection
          narrative={ssrWeek.narrative}
          readingLevel={readingLevel}
          editorial={ssrWeek.editorial}
        />
      </div>
      <nav className="flex items-center justify-between py-3 border-t border-dm-border">
        <div>
          {ssrWeek.prevWeek && (
            <AdjacentLink week={ssrWeek.prevWeek} label="Previous" slug={slug} />
          )}
        </div>
        <div>
          {ssrWeek.nextWeek && <AdjacentLink week={ssrWeek.nextWeek} label="Next" slug={slug} />}
        </div>
      </nav>
      <p className="text-xs text-dm-muted">
        <Link href={`/weekly/${ssrWeek.weekOf}`} className="text-dm-accent hover:underline">
          View weekly summary for {formatWeekLabelWithYear(ssrWeek.weekOf)} &rarr;
        </Link>
      </p>
    </div>
  );
}
