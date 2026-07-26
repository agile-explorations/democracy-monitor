/**
 * Dated ingest-methodology changes (#576). Rendered as markers on structural
 * timelines so pipeline changes are not read as government behavior, and used
 * to suppress below-baseline standout runs that overlap an instrument change
 * for the affected category (#577: the 2026 civilLiberties "quiet band" was
 * CL ingest rework, not the world — CL rows fell ~1,100→~100/month while
 * every other source in the category rose).
 *
 * PROPOSED list — dates approximate to the week; owner approves before ship.
 */

export interface InstrumentChange {
  /** Monday of the week the change took effect in prod. */
  date: string;
  /** Plain-language, user-facing description of the change. */
  label: string;
  /** Omit for platform-wide changes. */
  categories?: string[];
  /**
   * True when the change was applied to ALL historical data (history
   * reprocessed under the new rules — no before/after seam exists in the
   * series). Retroactive changes are disclosed on the methodology page but
   * MUST NOT appear as time-axis markers or drive findings-suppression:
   * a marker on a date claims the data before and after it are measured
   * differently, which is false for a retroactive change.
   */
  retroactive: boolean;
}

export const INSTRUMENT_CHANGES: InstrumentChange[] = [
  {
    date: '2026-02-02',
    label:
      'We changed how court records are collected. Document volumes before and after this period reflect different collection methods and are not directly comparable.',
    categories: ['civilLiberties', 'lawEnforcement', 'judicialIndependence', 'courtOrders'],
    retroactive: false,
  },
  {
    date: '2026-07-06',
    label:
      'A relevance filter for press-freedom coverage was applied to all periods, past and present.',
    categories: ['mediaFreedom'],
    retroactive: true,
  },
  {
    date: '2026-07-20',
    label: 'Document-count rules were updated and applied to all periods, past and present.',
    retroactive: true,
  },
];

/**
 * True when a change affecting the category took effect on or before the
 * range's end. Instrument changes are regime shifts, not point events: their
 * effect on level-based signals persists until baselines are recalibrated,
 * so any below-baseline run ending after the change date is suspect.
 */
export function overlapsInstrumentChange(
  category: string,
  _startWeek: string,
  endWeek: string,
): boolean {
  return INSTRUMENT_CHANGES.some(
    (c) =>
      !c.retroactive && (!c.categories || c.categories.includes(category)) && c.date <= endWeek,
  );
}

/**
 * Map each rendered week (ascending Mondays) to the instrument-change labels
 * landing in it. Shared by the structural and thematic heatmaps (#576/#580).
 */
export function buildMarkersByWeek(weeks: string[], weekLengthDays = 7): Map<string, string[]> {
  const map = new Map<string, string[]>();
  if (weeks.length === 0) return map;
  for (const change of INSTRUMENT_CHANGES) {
    if (change.retroactive) continue;
    let owner: string | null = null;
    for (let i = weeks.length - 1; i >= 0; i--) {
      if (weeks[i] <= change.date) {
        const isLast = i === weeks.length - 1;
        if (!isLast || dateWithinDays(change.date, weeks[i], weekLengthDays)) owner = weeks[i];
        break;
      }
    }
    if (owner) map.set(owner, [...(map.get(owner) ?? []), change.label]);
  }
  return map;
}

function dateWithinDays(date: string, weekStart: string, days: number): boolean {
  const start = new Date(`${weekStart}T00:00:00Z`).getTime();
  const d = new Date(`${date}T00:00:00Z`).getTime();
  return d - start < days * 24 * 60 * 60 * 1000;
}
