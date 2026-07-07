import Link from 'next/link';
import type { SignificantWeekLink } from '@/lib/hooks/useLandingNarratives';
import { formatWeekLabelWithYear } from '@/lib/utils/date-utils';

export interface SignificantWeeksListProps {
  weeks: SignificantWeekLink[];
}

/**
 * Deterministic index of notable term weeks (computed from weekly_aggregates,
 * no AI), each linking to its /weekly page. Companion to the term summary.
 */
export function SignificantWeeksList({ weeks }: SignificantWeeksListProps) {
  if (weeks.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-dm-border bg-dm-card p-4">
      <h3 className="text-xs font-semibold text-dm-text-primary mb-2">Significant weeks</h3>
      <ul className="space-y-1.5">
        {weeks.map((w) => (
          <li key={w.weekOf} className="text-xs leading-snug">
            <Link href={`/weekly/${w.weekOf}`} className="text-dm-accent hover:underline">
              Week of {formatWeekLabelWithYear(w.weekOf)}
            </Link>
            <span className="text-dm-muted"> — {w.reasons.map((r) => r.detail).join('; ')}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
