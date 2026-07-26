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
  label: string;
  /** Omit for platform-wide changes. */
  categories?: string[];
}

export const INSTRUMENT_CHANGES: InstrumentChange[] = [
  {
    date: '2026-02-02',
    label: 'CourtListener ingest rework begins: docket noise purges, opinion-first fetching',
    categories: ['civilLiberties', 'lawEnforcement', 'judicialIndependence', 'courtOrders'],
  },
  {
    date: '2026-07-06',
    label: 'mediaFreedom retrieval-relevance filter (#544)',
    categories: ['mediaFreedom'],
  },
  {
    date: '2026-07-20',
    label: 'Substantive-count floor: docket stubs excluded from weekly counts (#566)',
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
    (c) => (!c.categories || c.categories.includes(category)) && c.date <= endWeek,
  );
}
