import { stripHtml } from '@/lib/parsers/feed-parser';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { toDateString } from '@/lib/utils/date-utils';

const GOVINFO_API_BASE = 'https://api.govinfo.gov';
const RATE_LIMIT_DELAY_MS = 200;
const FETCH_TIMEOUT_MS = 30_000;
const GRANULES_PAGE_SIZE = 100;

// --- Types ---

export type CrecChamber = 'HOUSE' | 'SENATE';
export type CrecContentType = 'floor_speech' | 'legislative_action' | 'nomination';

/** A CREC granule from the GovInfo Granules API. */
export interface CrecGranule {
  title: string;
  granuleId: string;
  granuleLink: string;
  granuleClass: string;
}

/** Speaker metadata from a CREC granule summary. */
export interface CrecSpeaker {
  memberName: string;
  bioGuideId?: string;
  party?: string;
  state?: string;
  chamber?: string;
}

/** Full granule summary from the GovInfo API. */
export interface CrecGranuleSummary {
  title: string;
  granuleId: string;
  dateIssued: string;
  granuleClass: string;
  subGranuleClass?: string;
  members?: Array<{
    role?: string;
    chamber?: string;
    bioGuideId?: string;
    memberName?: string;
    state?: string;
    party?: string;
  }>;
  download?: {
    txtLink?: string;
    pdfLink?: string;
  };
  detailsLink?: string;
  pagePrefix?: string;
}

/** Granules list API response. */
interface GranulesListResponse {
  count: number;
  granules: CrecGranule[];
  nextPage?: string;
}

// --- Procedural filter ---

/** subGranuleClass values that are procedural noise — no analytical value. */
const PROCEDURAL_SUBCLASSES = new Set([
  'PRAYER',
  'PLEDGE',
  'ADJOURNMENT',
  'RECESS',
  'DESIGNATIONSPEAKER',
  'HJOURNAL',
  'SAMENDMENTTEXTIND',
  'SAMENDMENTTEXT',
  'SAMENDMENTSSUB',
]);

/** Titles that indicate procedural entries to skip. */
const PROCEDURAL_TITLE_PATTERNS = [
  /^PRAYER$/i,
  /^PLEDGE OF ALLEGIANCE$/i,
  /^ADJOURNMENT$/i,
  /^RECESS$/i,
  /^CONGRESSIONAL RECORD$/i,
  /^(Senate|House of Representatives)$/i,
  /^(MORNING BUSINESS|CONCLUSION OF MORNING BUSINESS)$/i,
  /^RESERVATION OF LEADER TIME$/i,
  /^RECOGNITION OF THE MAJORITY LEADER$/i,
  /^RECOGNITION OF THE MINORITY LEADER$/i,
  /^ORDERS FOR /i,
  /^MEASURES? (READ THE FIRST TIME|PLACED ON|REFERRED)$/i,
  /^Constitutional Authority Statement/i,
  /^LEGISLATIVE SESSION( *--|$)/i,
  /^EXECUTIVE SESSION( *--|$)/i,
  /^EXECUTIVE CALENDAR/i,
  /^(CERTIFICATES? OF ELECTION|ADMINISTRATION OF OATHS?)$/i,
  /^Cloture Motion/i,
  /^(ADDITIONAL SPONSORS|ADDITIONAL COSPONSORS)$/i,
  /^ANNOUNCEMENT BY THE /i,
  /^EXECUTIVE COMMUNICATIONS?,? ETC/i,
  /^PUBLIC BILLS AND RESOLUTIONS$/i,
  /^INTRODUCTION OF BILLS AND JOINT RESOLUTIONS$/i,
];

/** Check if a granule is procedural noise that should be filtered out. */
export function isProceduralGranule(
  title: string,
  subGranuleClass?: string,
  granuleId?: string,
): boolean {
  if (granuleId && granuleId.includes('FrontMatter')) return true;
  if (subGranuleClass && PROCEDURAL_SUBCLASSES.has(subGranuleClass)) return true;
  return PROCEDURAL_TITLE_PATTERNS.some((p) => p.test(title.trim()));
}

// --- Content type classification ---

/** Classify a CREC granule into a content type for downstream processing. */
export function classifyCrecContentType(title: string, subGranuleClass?: string): CrecContentType {
  if (subGranuleClass === 'SNOMINATIONS' || /\bNOMINATION/i.test(title)) {
    return 'nomination';
  }

  const legislativePatterns = [
    /^(INTRODUCTION OF|SUBMISSION OF|ADDITIONAL COSPONSORS)/i,
    /^(REPORTS OF COMMITTEES|EXECUTIVE REPORT)/i,
    /^(PUBLIC BILLS|SENATE RESOLUTION|HOUSE RESOLUTION|JOINT RESOLUTION)/i,
    /^(EXECUTIVE AND OTHER COMMUNICATIONS|PETITIONS AND MEMORIALS)/i,
    /^(AUTHORITY FOR COMMITTEES TO MEET|Constitutional Authority)/i,
    /^(ENROLLED BILL SIGNED|BILLS? PRESENTED|MEASURES? PASSED)/i,
    /^Cloture Motion/i,
  ];
  if (legislativePatterns.some((p) => p.test(title.trim()))) {
    return 'legislative_action';
  }

  return 'floor_speech';
}

// --- Parsing ---

/** Parse a crec:// pseudo-URL into fetch parameters. */
export function parseCrecParams(signalUrl: string): {
  chambers: CrecChamber[];
} {
  const parsed = new URL(signalUrl.replace('crec://', 'http://crec/'));
  const chamberStr = parsed.searchParams.get('chamber') || 'senate,house';
  const chambers = chamberStr.split(',').map((c) => c.trim().toUpperCase() as CrecChamber);
  return { chambers };
}

/** Extract speakers from a granule summary. */
export function extractSpeakers(summary: CrecGranuleSummary): CrecSpeaker[] {
  if (!summary.members || summary.members.length === 0) return [];
  return summary.members
    .filter((m) => m.memberName)
    .map((m) => ({
      memberName: m.memberName!,
      bioGuideId: m.bioGuideId || undefined,
      party: m.party || undefined,
      state: m.state || undefined,
      chamber: m.chamber || undefined,
    }));
}

/** Get the primary (first) speaker's display name, or null. */
export function primarySpeakerName(summary: CrecGranuleSummary): string | null {
  const speakers = extractSpeakers(summary);
  return speakers.length > 0 ? speakers[0].memberName : null;
}

/** Convert a CREC granule summary + text into a ContentItem. */
export function toContentItem(summary: CrecGranuleSummary, text: string | null): ContentItem {
  const speakers = extractSpeakers(summary);
  const primary = speakers[0];
  const crecContentType = classifyCrecContentType(summary.title, summary.subGranuleClass);

  const detailsUrl =
    summary.detailsLink ||
    `https://www.govinfo.gov/app/details/CREC-${summary.dateIssued}/${summary.granuleId}`;

  return {
    title: summary.title || '(untitled)',
    link: detailsUrl,
    pubDate: summary.dateIssued,
    agency: primary
      ? `${primary.memberName} (${primary.party || '?'}-${primary.state || '?'})`
      : 'Congressional Record',
    content: text || undefined,
    type: crecContentType,
    sourceOrigin: 'crec',
    metadata: {
      granuleId: summary.granuleId,
      granuleClass: summary.granuleClass,
      subGranuleClass: summary.subGranuleClass,
      crecContentType,
      chamber: summary.granuleClass === 'SENATE' ? 'senate' : 'house',
      speakers: speakers.length > 0 ? speakers : undefined,
      pagePrefix: summary.pagePrefix,
    },
  };
}

// --- API helpers ---

function getApiKey(): string | undefined {
  return process.env.GOVINFO_API_KEY;
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'DemocracyMonitor/1.0 (crec-fetcher)' },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`[crec] HTTP ${response.status} for ${url.split('?')[0]}`);
  }
  return response.json() as Promise<T>;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'DemocracyMonitor/1.0 (crec-fetcher)' },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return response.text();
  } catch (err) {
    console.warn(`[crec] Text fetch failed for ${url.split('?')[0]}: ${err}`);
    return null;
  }
}

// --- Core fetch functions ---

/** Fetch all granules for a specific CREC date and chamber. */
async function fetchDayGranules(
  date: string,
  chamber: CrecChamber,
  apiKey: string,
): Promise<CrecGranule[]> {
  const packageId = `CREC-${date}`;
  const allGranules: CrecGranule[] = [];
  let url =
    `${GOVINFO_API_BASE}/packages/${packageId}/granules` +
    `?granuleClass=${chamber}&pageSize=${GRANULES_PAGE_SIZE}&offsetMark=*&api_key=${apiKey}`;

  const maxPages = 10;
  for (let page = 0; page < maxPages; page++) {
    let data: GranulesListResponse;
    try {
      data = await fetchJson<GranulesListResponse>(url);
    } catch (err) {
      // No CREC package for this date (weekends, holidays, recesses)
      if (String(err).includes('HTTP 404')) return [];
      throw err;
    }

    allGranules.push(...(data.granules || []));

    if (!data.nextPage || (data.granules || []).length < GRANULES_PAGE_SIZE) break;
    url = `${data.nextPage}&api_key=${apiKey}`;
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  return allGranules;
}

/** Fetch the full summary for a single granule. */
async function fetchGranuleSummary(
  granuleLink: string,
  apiKey: string,
): Promise<CrecGranuleSummary> {
  return fetchJson<CrecGranuleSummary>(`${granuleLink}?api_key=${apiKey}`);
}

/** Fetch the HTML text content of a granule, return as stripped plaintext. */
export async function fetchGranuleText(
  packageId: string,
  granuleId: string,
  apiKey: string,
): Promise<string | null> {
  const url = `${GOVINFO_API_BASE}/packages/${packageId}/granules/${granuleId}/htm?api_key=${apiKey}`;
  const html = await fetchText(url);
  if (!html) return null;

  let text = stripHtml(html).replace(/\0/g, '').trim();
  if (!text) return null;

  // Strip the Congressional Record header that appears in every granule:
  // "Congressional Record, Volume NNN Issue NN (...) [...] [Page XXXX] From the ... [ www.gpo.gov ]"
  const headerEnd = text.indexOf('www.gpo.gov');
  if (headerEnd !== -1) {
    const afterHeader = text.slice(headerEnd + 'www.gpo.gov'.length).replace(/^[\s\]]+/, '');
    if (afterHeader.length > 0) text = afterHeader;
  }

  return text;
}

/**
 * Fetch CREC documents for a single date across specified chambers.
 * Filters out procedural entries, fetches summaries + text for substantive granules.
 */
export async function fetchCrecForDate(
  date: string,
  chambers: CrecChamber[],
  apiKey: string,
): Promise<ContentItem[]> {
  const items: ContentItem[] = [];
  const packageId = `CREC-${date}`;

  for (const chamber of chambers) {
    const granules = await fetchDayGranules(date, chamber, apiKey);
    await sleep(RATE_LIMIT_DELAY_MS);

    // Filter procedural entries before fetching summaries (save API calls)
    const substantive = granules.filter(
      (g) => !isProceduralGranule(g.title, undefined, g.granuleId),
    );

    for (const granule of substantive) {
      try {
        const summary = await fetchGranuleSummary(granule.granuleLink, apiKey);
        await sleep(RATE_LIMIT_DELAY_MS);

        // Second filter pass with full subGranuleClass info
        if (isProceduralGranule(summary.title, summary.subGranuleClass, summary.granuleId)) {
          continue;
        }

        const text = await fetchGranuleText(packageId, granule.granuleId, apiKey);
        await sleep(RATE_LIMIT_DELAY_MS);

        items.push(toContentItem(summary, text));
      } catch (err) {
        console.warn(`[crec] Failed to fetch granule ${granule.granuleId}: ${err}`);
      }
    }
  }

  return items;
}

// --- Pipeline entry points ---

/** Fetch recent CREC documents for the snapshot pipeline (last 7 days). */
export async function fetchCrecRecent(params: { chambers: CrecChamber[] }): Promise<ContentItem[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[crec] GOVINFO_API_KEY not set, skipping fetch');
    return [];
  }

  const allItems: ContentItem[] = [];
  const today = new Date();

  for (let daysBack = 1; daysBack <= 7; daysBack++) {
    const date = new Date(today);
    date.setDate(date.getDate() - daysBack);
    const dateStr = toDateString(date);
    const dayOfWeek = date.getDay();

    // Skip weekends — Congress doesn't publish CREC on Saturday (6) or Sunday (0)
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    try {
      const items = await fetchCrecForDate(dateStr, params.chambers, apiKey);
      allItems.push(...items);
      console.log(`[crec] ${dateStr}: ${items.length} substantive entries`);
    } catch (err) {
      console.warn(`[crec] Failed to fetch ${dateStr}: ${err}`);
    }
  }

  return allItems;
}

/** Fetch CREC documents for a date range (backfill pipeline). */
export async function fetchCrecHistorical(params: {
  chambers: CrecChamber[];
  dateFrom: string;
  dateTo: string;
}): Promise<ContentItem[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[crec] GOVINFO_API_KEY not set, skipping backfill');
    return [];
  }

  const allItems: ContentItem[] = [];
  const start = new Date(params.dateFrom);
  const end = new Date(params.dateTo);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dayOfWeek = d.getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) continue;

    const dateStr = toDateString(d);
    try {
      const items = await fetchCrecForDate(dateStr, params.chambers, apiKey);
      allItems.push(...items);
      if (items.length > 0) {
        console.log(`[crec] ${dateStr}: ${items.length} entries`);
      }
    } catch (err) {
      console.warn(`[crec] Failed to fetch ${dateStr}: ${err}`);
    }
  }

  return allItems;
}
