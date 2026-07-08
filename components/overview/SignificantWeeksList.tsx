import Link from 'next/link';
import type { SignificantWeekLink } from '@/lib/hooks/useLandingNarratives';
import { formatWeekLabelWithYear } from '@/lib/utils/date-utils';

export interface SignificantWeeksListProps {
  weeks: SignificantWeekLink[];
}

/**
 * Index of notable term weeks, each linking to its /weekly page. Ranking is
 * deterministic (weekly_aggregates); the event headline is AI-generated at
 * index recompute and falls back to the deterministic reason text when absent.
 */
export function SignificantWeeksList({ weeks }: SignificantWeeksListProps) {
  if (weeks.length === 0) return null;

  return (
    <div className="mt-3 rounded-lg border border-dm-border bg-dm-card p-4">
      <h3 className="text-xs font-semibold text-dm-text-primary mb-2">Significant weeks</h3>
      <ul className="space-y-2">
        {weeks.map((w) => {
          const reasonText = w.reasons.map((r) => r.detail).join(' · ');
          return (
            <li key={w.weekOf} className="text-xs leading-snug">
              <Link href={`/weekly/${w.weekOf}`} className="text-dm-accent hover:underline">
                Week of {formatWeekLabelWithYear(w.weekOf)}
              </Link>
              {w.headline ? (
                <>
                  <span className="text-dm-text-secondary"> — {w.headline}</span>
                  <div className="text-[11px] text-dm-muted mt-0.5">{reasonText}</div>
                </>
              ) : (
                <span className="text-dm-muted"> — {reasonText}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
