import Link from 'next/link';
import { useState } from 'react';
import { CONCERN_LEVEL_LABELS } from '@/lib/data/concern-level-explanations';
import type { ArchiveWeekEntry } from '@/lib/services/ssr-narrative-data';
import { formatWeekLabelWithYear } from '@/lib/utils/date-utils';

const STATUS_LABELS: Record<string, string> = CONCERN_LEVEL_LABELS;

const ARCHIVE_COLLAPSED_COUNT = 12;

const STATUS_COLORS: Record<string, string> = {
  Elevated: 'text-convergence-elevated',
  ConfirmedConcern: 'text-convergence-confirmed',
};

/** Server-rendered week archive list for the category page (crawler-visible). */
export function WeekArchiveSection({
  archiveWeeks,
  slug,
}: {
  archiveWeeks: ArchiveWeekEntry[];
  slug: string;
}) {
  const [expanded, setExpanded] = useState(false);
  if (archiveWeeks.length === 0) return null;
  const visible = expanded ? archiveWeeks : archiveWeeks.slice(0, ARCHIVE_COLLAPSED_COUNT);
  return (
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
        {visible.map((w) => {
          const statusLabel = w.status ? (STATUS_LABELS[w.status] ?? w.status) : null;
          const statusColor = w.status ? (STATUS_COLORS[w.status] ?? '') : '';
          return (
            <li key={w.weekOf} className="flex items-center justify-between text-sm py-1">
              <Link
                href={`/category/${slug}/week/${w.weekOf}`}
                className="text-dm-accent hover:underline"
              >
                Week of {formatWeekLabelWithYear(w.weekOf)}
              </Link>
              {statusLabel && (
                <span className={`text-xs font-medium ${statusColor}`}>{statusLabel}</span>
              )}
            </li>
          );
        })}
      </ul>
      {archiveWeeks.length > ARCHIVE_COLLAPSED_COUNT && !expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs text-dm-accent hover:underline"
        >
          Show all {archiveWeeks.length} weeks
        </button>
      )}
    </section>
  );
}
