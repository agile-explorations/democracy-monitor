import Link from 'next/link';
import { useState } from 'react';
import type { SignificantWeekLink } from '@/lib/hooks/useLandingNarratives';
import { formatWeekLabelWithYear } from '@/lib/utils/date-utils';

export interface SignificantWeeksListProps {
  weeks: SignificantWeekLink[];
}

/** Weeks shown before the "Show all" toggle. */
const INITIAL_VISIBLE = 5;

/** Human badge labels per significance reason type. */
const BADGE_LABELS: Record<string, string> = {
  peak_concern: 'Term peak',
  concern_spike: 'Spike',
  new_concern: 'New concerns',
  monitoring_began: 'Monitoring began',
};

/**
 * Index of notable term weeks, each linking to its /weekly page. Ranking is
 * deterministic (weekly_aggregates); the event headline is AI-generated at
 * index recompute and falls back to the deterministic reason text when absent.
 */
export function SignificantWeeksList({ weeks }: SignificantWeeksListProps) {
  const [showAll, setShowAll] = useState(false);
  if (weeks.length === 0) return null;

  // Chronological, newest first — no ranking claim; the event badges say
  // why each week is listed (owner decision 2026-07-26).
  const sorted = [...weeks].sort((a, b) => b.weekOf.localeCompare(a.weekOf));
  const visible = showAll ? sorted : sorted.slice(0, INITIAL_VISIBLE);

  return (
    <div className="mt-3 rounded-lg border border-dm-border bg-dm-card p-4">
      <h3 className="text-xs font-semibold text-dm-text-primary mb-2">
        Significant weeks <span className="font-normal text-dm-muted">(most recent first)</span>
      </h3>
      <ul className="space-y-2">
        {visible.map((w) => {
          const reasonText = w.reasons.map((r) => r.detail).join(' · ');
          return (
            <li key={w.weekOf} className="text-xs leading-snug flex items-start gap-1.5">
              {/* Badge column stays fixed so wrapped text hangs at the text
                  margin instead of flowing back under the badges. */}
              <span className="flex shrink-0 gap-1 pt-px">
                {w.reasons.map((r) => (
                  <span
                    key={r.type}
                    className={`inline-block px-1.5 py-px rounded-full border text-[10px] ${
                      r.type === 'peak_concern'
                        ? 'border-red-500/40 text-red-600 dark:text-red-400'
                        : 'border-dm-border text-dm-text-secondary'
                    }`}
                  >
                    {BADGE_LABELS[r.type] ?? r.type}
                  </span>
                ))}
              </span>
              <span className="min-w-0">
                <Link href={`/weekly/${w.weekOf}`} className="text-dm-accent hover:underline">
                  Week of {formatWeekLabelWithYear(w.weekOf)}
                </Link>
                {typeof w.concernScore === 'number' && (
                  <span className="text-dm-muted"> · Departure Score {w.concernScore}</span>
                )}
                {w.headline ? (
                  <>
                    <span className="text-dm-text-secondary"> — {w.headline}</span>
                    <span className="block text-[11px] text-dm-muted mt-0.5">{reasonText}</span>
                  </>
                ) : (
                  <span className="text-dm-muted"> — {reasonText}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {weeks.length > INITIAL_VISIBLE && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-xs text-dm-accent hover:underline"
        >
          {showAll ? 'Show fewer' : `Show all ${weeks.length}`}
        </button>
      )}
    </div>
  );
}
