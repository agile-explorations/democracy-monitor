import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const DOJ_API_BASE = 'https://www.justice.gov/api/v1/press_releases.json';
const POLITENESS_DELAY_MS = 200;
const MAX_SUMMARY_LENGTH = 800;

interface DojPressRelease {
  uuid?: string;
  title?: string;
  body?: string;
  published_date?: string;
  changed_date?: string;
  component?: string;
  topic?: string;
  url?: string;
}

interface DojApiResponse {
  results?: DojPressRelease[];
  pager?: { next?: string; count?: number };
}

/**
 * Parse a DOJ signal URL to extract component/topic filters.
 * Format: doj://press?component=criminal-division&topic=civil+rights
 */
export function parseDojSignalParams(signalUrl: string): {
  component?: string;
  topic?: string;
} {
  const parsed = new URL(signalUrl.replace('doj://', 'http://doj/'));
  return {
    component: parsed.searchParams.get('component') || undefined,
    topic: parsed.searchParams.get('topic') || undefined,
  };
}

function truncate(text: string): string {
  return text.length > MAX_SUMMARY_LENGTH ? text.slice(0, MAX_SUMMARY_LENGTH) + '\u2026' : text;
}

/** Convert a DOJ press release to a ContentItem. */
export function toContentItem(release: DojPressRelease): ContentItem {
  const fullUrl = release.url
    ? release.url.startsWith('http')
      ? release.url
      : `https://www.justice.gov${release.url}`
    : undefined;

  return {
    title: release.title || '(untitled release)',
    link: fullUrl,
    pubDate: release.published_date || release.changed_date,
    agency: release.component || 'Department of Justice',
    summary: release.body ? truncate(stripHtmlBasic(release.body)) : undefined,
    type: 'press_release',
    sourceOrigin: 'doj',
  };
}

/** Minimal HTML tag stripper for DOJ body text. */
function stripHtmlBasic(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildDojUrl(params: { component?: string; topic?: string; page?: number }): string {
  const qs = new URLSearchParams();
  if (params.component) qs.set('component', params.component);
  if (params.topic) qs.set('topic', params.topic);
  if (params.page) qs.set('page', String(params.page));
  const queryStr = qs.toString();
  return queryStr ? `${DOJ_API_BASE}?${queryStr}` : DOJ_API_BASE;
}

/** Fetch recent DOJ press releases for the snapshot pipeline. */
export async function fetchDojRecent(params: {
  component?: string;
  topic?: string;
}): Promise<ContentItem[]> {
  const url = buildDojUrl(params);

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'DemocracyMonitor/1.0',
    },
  });

  if (!response.ok) {
    console.error(`[doj] HTTP ${response.status}`);
    return [];
  }

  const data: DojApiResponse = await response.json();
  return (data.results || []).slice(0, 20).map(toContentItem);
}

/** Fetch historical DOJ press releases for the backfill pipeline. */
export async function fetchDojHistorical(params: {
  component?: string;
  topic?: string;
  dateFrom: string;
  dateTo: string;
  maxPages?: number;
}): Promise<ContentItem[]> {
  const { maxPages = 10 } = params;
  const allItems: ContentItem[] = [];
  const fromDate = new Date(params.dateFrom);
  const toDate = new Date(params.dateTo);

  for (let page = 0; page < maxPages; page++) {
    const url = buildDojUrl({ component: params.component, topic: params.topic, page });

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DemocracyMonitor/1.0 (backfill)',
      },
    });

    if (!response.ok) {
      console.error(`[doj] HTTP ${response.status} on page ${page}`);
      break;
    }

    const data: DojApiResponse = await response.json();
    const releases = data.results || [];
    if (releases.length === 0) break;

    const filtered = releases.filter((r) => {
      const d = r.published_date ? new Date(r.published_date) : null;
      return d && d >= fromDate && d <= toDate;
    });

    allItems.push(...filtered.map(toContentItem));

    // Stop if we've gone past our date range
    const lastDate = releases[releases.length - 1]?.published_date;
    if (lastDate && new Date(lastDate) < fromDate) break;

    if (!data.pager?.next) break;
    await sleep(POLITENESS_DELAY_MS);
  }

  return allItems;
}
