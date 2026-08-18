import Link from 'next/link';
import { WeekNavigator } from '@/components/landing/WeekNavigator';
import { Sparkline } from '@/components/ui/Sparkline';
import { useReadingLevel } from '@/lib/contexts/ReadingLevelContext';
import { useTheme } from '@/lib/contexts/ThemeContext';
import { CONCERN_LEVEL_COLORS } from '@/lib/data/chart-colors';
import {
  CONCERN_LEVEL_TOOLTIPS,
  concernLevelCountLabel,
} from '@/lib/data/concern-level-explanations';
import type { SignificantWeekLink } from '@/lib/hooks/useLandingNarratives';
import type { ConcernLevel } from '@/lib/types';
import type { FetchWeekHealth, SynchronyPoint } from '@/lib/types/overview';
import { formatWeekLabelWithYear } from '@/lib/utils/date-utils';

const STATUS_ORDER: ConcernLevel[] = ['ConfirmedConcern', 'Elevated', 'Stable'];

/** Tally current-week convergence statuses from the category summaries. */
export function tallyCurrentWeekStatuses(
  categories: Array<{ convergenceStatus: ConcernLevel | null }>,
): Partial<Record<ConcernLevel, number>> {
  const counts: Partial<Record<ConcernLevel, number>> = {};
  for (const c of categories) {
    if (!c.convergenceStatus) continue;
    counts[c.convergenceStatus] = (counts[c.convergenceStatus] ?? 0) + 1;
  }
  return counts;
}

/**
 * One-line notable condition for the strip. Data-gap streaks take priority
 * (they qualify every other number on the page); otherwise, if the current
 * week made the significant-weeks index, show its headline.
 */
export function deriveNotableCondition(
  fetchTimeline: FetchWeekHealth[],
  significantWeeks: SignificantWeekLink[],
  currentWeek: string | null,
): string | null {
  let streak = 0;
  for (let i = fetchTimeline.length - 1; i >= 0; i--) {
    if (fetchTimeline[i].failed > 0) streak++;
    else break;
  }
  if (streak >= 2) return `${ordinal(streak)} consecutive week with data gaps`;
  if (streak === 1) return 'Data gaps this week';

  if (currentWeek) {
    const sig = significantWeeks.find((w) => w.weekOf === currentWeek);
    if (sig?.headline) return sig.headline;
  }
  return null;
}

function ordinal(n: number): string {
  const suffix =
    n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th';
  return `${n}${suffix}`;
}

function WeekLabel({
  weekOf,
  isLatestWeek,
  weekNavigation,
}: Pick<ThisWeekStripProps, 'weekOf' | 'isLatestWeek' | 'weekNavigation'>) {
  const label = (
    <div className="text-center">
      <p className="text-[11px] uppercase tracking-wider text-dm-muted">
        {isLatestWeek ? 'This week' : 'Week of'}
      </p>
      <p className="text-sm font-semibold text-dm-text-primary">
        {weekOf ? formatWeekLabelWithYear(weekOf) : '—'}
      </p>
    </div>
  );
  if (!weekNavigation || weekNavigation.availableWeeks.length === 0) return label;
  return (
    <WeekNavigator
      availableWeeks={weekNavigation.availableWeeks}
      selectedWeek={weekNavigation.selectedWeek}
      onWeekChange={weekNavigation.onWeekChange}
    >
      {label}
    </WeekNavigator>
  );
}

export interface ThisWeekStripProps {
  weekOf: string | null;
  /** When provided, the week label is wrapped in navigation arrows. */
  weekNavigation?: {
    availableWeeks: string[];
    selectedWeek: string | null;
    onWeekChange: (week: string) => void;
  };
  /** True when showing the latest week (label + data-gap streak semantics). */
  isLatestWeek: boolean;
  /** True while a past week's category data is being fetched. */
  weekLoading?: boolean;
  /** One-line event headline for the viewed week (#539); null while absent. */
  headline?: string | null;
  categories: Array<{ convergenceStatus: ConcernLevel | null }>;
  synchrony: SynchronyPoint[];
  fetchTimeline: FetchWeekHealth[];
  significantWeeks: SignificantWeekLink[];
}

/**
 * Compact current-week status strip (#533): the landing page's first answer
 * to "what changed this week?". Status counts + notable condition + a mini
 * concern sparkline that jumps to the full interactive chart.
 */
export function ThisWeekStrip({
  weekOf,
  weekNavigation,
  isLatestWeek,
  weekLoading = false,
  headline = null,
  categories,
  synchrony,
  fetchTimeline,
  significantWeeks,
}: ThisWeekStripProps) {
  const { readingLevel } = useReadingLevel();
  const { resolvedMode } = useTheme();
  const colors = CONCERN_LEVEL_COLORS[resolvedMode];

  const counts = tallyCurrentWeekStatuses(categories);
  // Headline precedence (#539): the week's own headline, else the
  // significant-week headline. Data-gap streaks describe the present and
  // render as a separate caveat on the latest week only.
  const sigHeadline = weekOf
    ? (significantWeeks.find((w) => w.weekOf === weekOf)?.headline ?? null)
    : null;
  const shownHeadline = headline ?? sigHeadline;
  const gapCaveat = isLatestWeek ? deriveNotableCondition(fetchTimeline, [], null) : null;
  const sparkData = synchrony.map((p) => ({ week: p.week, score: p.weightedScore }));

  const countParts = STATUS_ORDER.filter((s) => (counts[s] ?? 0) > 0);

  return (
    <section
      id="this-week"
      aria-label="This week's status"
      className="flex flex-col gap-2 rounded-lg border border-dm-border bg-dm-card px-4 py-3"
    >
      {/* Row 1 — fixed positions: nav+label · counts · (right) sparkline + links */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <WeekLabel weekOf={weekOf} isLatestWeek={isLatestWeek} weekNavigation={weekNavigation} />

        <div className="flex items-center gap-3" aria-label="Category status counts">
          {weekLoading ? (
            <span className="text-sm text-dm-muted animate-pulse">Loading…</span>
          ) : countParts.length > 0 ? (
            countParts.map((status) => (
              <span
                key={status}
                className="flex items-center gap-1.5 text-sm cursor-help"
                title={CONCERN_LEVEL_TOOLTIPS[status]}
              >
                <span
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: colors[status as keyof typeof colors] }}
                  aria-hidden
                />
                <span className="text-dm-text-primary font-medium">{counts[status]}</span>
                <span className="text-dm-text-secondary">
                  {concernLevelCountLabel(status, counts[status] ?? 0)}
                </span>
              </span>
            ))
          ) : (
            <span className="text-sm text-dm-muted">No assessment yet</span>
          )}
        </div>

        {sparkData.length > 1 && (
          <a
            href="#concern-score"
            aria-label="View full concern chart"
            title="View full concern chart"
            className="ml-auto opacity-80 hover:opacity-100 transition-opacity"
          >
            <Sparkline
              data={sparkData}
              baselineAvg={0}
              baselineStdDev={0}
              width={160}
              height={32}
              highlightWeek={weekOf ?? undefined}
            />
          </a>
        )}

        <nav aria-label="Jump to section" className="flex items-center gap-3 text-xs">
          <Link href="#categories" className="text-dm-accent hover:underline">
            This week
          </Link>
          <Link href="#concern-score" className="text-dm-accent hover:underline">
            Trend
          </Link>
          <Link href="#term-summary" className="text-dm-accent hover:underline">
            Term so far
          </Link>
          {readingLevel === 'detailed' && (
            <Link href="#status-heatmap" className="text-dm-accent hover:underline">
              Heatmap
            </Link>
          )}
        </nav>
      </div>

      {/* Row 2 — the headline's length can't move anything above */}
      {(shownHeadline || gapCaveat) && (
        <p className="text-xs text-dm-text-secondary border-l-2 border-dm-border pl-3">
          {shownHeadline}
          {shownHeadline && gapCaveat && ' · '}
          {gapCaveat && <span className="text-status-drift">{gapCaveat}</span>}
        </p>
      )}
    </section>
  );
}
