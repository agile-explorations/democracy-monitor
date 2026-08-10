import {
  CL_API_V4,
  CL_BASE_URL,
  FETCH_TIMEOUT_MS,
  getAuthHeaders,
} from '@/lib/services/courtlistener-fetcher';
import { fetchWithRetry } from '@/lib/utils/fetch-retry';

/**
 * Docket-context timeline (#686, milestone R-DOCKET-CONTEXT). Builds a case's
 * procedural timeline and a one-line posture from CourtListener's v4
 * docket-entries endpoint. Fully deterministic — keyword classification only.
 *
 * Our stored docket-entry stubs are deliberately NOT used here: they hold only
 * query-matched filings (median 1/case) with caption-only titles. The stored
 * opinion's case_id (cl:<docketId>) is the join key; the substance is fetched
 * live and cached by the API route.
 */

export type DocketEventType =
  | 'complaint'
  | 'answer'
  | 'motion'
  | 'order'
  | 'judgment'
  | 'appeal'
  | 'dismissal'
  | 'termination'
  | 'hearing'
  | 'other';

export interface TimelineEntry {
  date: string;
  entryNumber: number | null;
  label: string;
  eventType: DocketEventType;
}

export interface CasePosture {
  line: string;
  eventType: DocketEventType;
  date: string;
}

export interface CaseTimeline {
  caseId: string;
  docketUrl: string;
  /** Captured at CL-fetch time — reports data age across cache hits. */
  asOf: string;
  entries: TimelineEntry[];
  posture: CasePosture | null;
  truncated: boolean;
}

interface RawDocketEntry {
  date_filed: string | null;
  entry_number: number | null;
  description: string | null;
  recap_documents?: Array<{ description?: string | null }>;
}

/** Parse a cl:<docketId> case id; null for anything else (strict, pre-URL). */
export function parseCaseId(caseId: string): number | null {
  const match = /^cl:(\d{1,10})$/.exec(caseId);
  return match ? parseInt(match[1], 10) : null;
}

/** Human label for an entry: description, else attached-document description, else Entry N. */
export function entryLabel(entry: RawDocketEntry): string {
  const description = entry.description?.trim();
  if (description) return description.replace(/\s+/g, ' ');
  const docDescription = entry.recap_documents?.[0]?.description?.trim();
  if (docDescription) return docDescription.replace(/\s+/g, ' ');
  return entry.entry_number !== null ? `Entry ${entry.entry_number}` : 'Docket entry';
}

/**
 * Ordered precedence: specific outcomes before generic classes, so
 * "Order of Dismissal" → dismissal and "Terminate Case" → termination
 * rather than order.
 */
const EVENT_PATTERNS: ReadonlyArray<[DocketEventType, RegExp]> = [
  ['termination', /terminat/i],
  ['dismissal', /dismiss/i],
  // 'summary judgment' is motion/order practice, not a terminal judgment.
  ['judgment', /(?<!summary )judgment/i],
  ['appeal', /appeal/i],
  ['order', /\border\b|findings|report and recommendation|granting|denying/i],
  ['motion', /motion|application/i],
  ['complaint', /complaint|petition|notice of removal/i],
  ['answer', /\banswer\b/i],
  ['hearing', /hearing|conference|trial|argument/i],
];

export function classifyDocketEntry(label: string): DocketEventType {
  for (const [eventType, pattern] of EVENT_PATTERNS) {
    if (pattern.test(label)) return eventType;
  }
  return 'other';
}

const TERMINAL_EVENTS: ReadonlySet<DocketEventType> = new Set([
  'termination',
  'dismissal',
  'judgment',
]);

/** Shorten a docket label for the one-line posture. */
function postureLabel(label: string): string {
  const compact = label.replace(/\s+/g, ' ').trim();
  return compact.length > 60 ? `${compact.slice(0, 57)}…` : compact;
}

/**
 * Derive a one-line case posture from date-descending entries:
 * terminal event → "Case terminated {date} — {label}" (judgment phrased as
 * "Judgment entered"); else latest order/motion with a latest-activity suffix;
 * else the bare latest activity.
 */
export function derivePosture(entries: TimelineEntry[]): CasePosture | null {
  if (entries.length === 0) return null;
  const latest = entries[0];

  const terminal = entries.find((e) => TERMINAL_EVENTS.has(e.eventType));
  if (terminal) {
    const line =
      terminal.eventType === 'judgment'
        ? `Judgment entered ${terminal.date}`
        : `Case terminated ${terminal.date} — ${postureLabel(terminal.label).toLowerCase()}`;
    return { line, eventType: terminal.eventType, date: terminal.date };
  }

  const significant = entries.find((e) => e.eventType === 'order' || e.eventType === 'motion');
  if (significant) {
    const suffix = significant.date === latest.date ? '' : `; latest activity ${latest.date}`;
    return {
      line: `${postureLabel(significant.label)} ${significant.date}${suffix}`,
      eventType: significant.eventType,
      date: significant.date,
    };
  }

  return {
    line: `Latest docket activity ${latest.date}`,
    eventType: latest.eventType,
    date: latest.date,
  };
}

export interface DocketEntriesPage {
  results: RawDocketEntry[];
  hasMore: boolean;
}

/** Fetch the newest page of docket entries for a docket (I/O, coverage-excluded). */
export async function fetchDocketEntries(docketId: number): Promise<DocketEntriesPage> {
  const url = `${CL_API_V4}/docket-entries/?docket=${docketId}&order_by=-date_filed&page_size=40`;
  const response = await fetchWithRetry(
    url,
    { headers: getAuthHeaders() },
    { label: 'docket-timeline', timeoutMs: FETCH_TIMEOUT_MS },
  );
  if (!response.ok)
    throw new Error(`[docket-timeline] HTTP ${response.status} for docket ${docketId}`);
  const data = (await response.json()) as { results?: RawDocketEntry[]; next?: string | null };
  return { results: data.results ?? [], hasMore: Boolean(data.next) };
}

/** Assemble the API payload from a raw page (pure). */
export function buildCaseTimeline(
  caseId: string,
  docketId: number,
  page: DocketEntriesPage,
  asOf: string,
): CaseTimeline {
  const entries: TimelineEntry[] = page.results
    .filter((r) => r.date_filed)
    .map((r) => {
      const label = entryLabel(r);
      return {
        date: r.date_filed as string,
        entryNumber: r.entry_number ?? null,
        label,
        eventType: classifyDocketEntry(label),
      };
    });
  return {
    caseId,
    docketUrl: `${CL_BASE_URL}/docket/${docketId}/`,
    asOf,
    entries,
    posture: derivePosture(entries),
    truncated: page.hasMore,
  };
}
