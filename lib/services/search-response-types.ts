/** Retrieval-shape types shared between the search API route and formatters. */

export interface RetrievalStratum {
  key: string;
  label: string;
  from: string;
  to?: string;
  docCount: number;
  /** True when the user's date range excludes this era entirely; the era
   *  window itself was searched and the conflict surfaced, not hidden. */
  dateConflict?: boolean;
}
