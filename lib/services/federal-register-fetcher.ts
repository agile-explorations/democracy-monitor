import { stripHtml } from '@/lib/parsers/feed-parser';
import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';

const MAX_SUMMARY_LENGTH = 800;

function truncate(text: string): string {
  return text.length > MAX_SUMMARY_LENGTH ? text.slice(0, MAX_SUMMARY_LENGTH) + '\u2026' : text;
}

function buildFrApiUrl(
  params: {
    agency?: string;
    type?: string;
    term?: string;
  },
  page: number,
  dateFrom: string,
  dateTo: string,
  perPage: number,
): string {
  const qs = new URLSearchParams();
  qs.set('per_page', String(perPage));
  qs.set('page', String(page));
  qs.set('order', 'oldest');
  qs.set('conditions[publication_date][gte]', dateFrom);
  qs.set('conditions[publication_date][lte]', dateTo);
  if (params.agency) qs.set('conditions[agencies][]', params.agency);
  if (params.type) qs.set('conditions[type][]', params.type);
  if (params.term) qs.set('conditions[term]', params.term);
  return `https://www.federalregister.gov/api/v1/documents.json?${qs.toString()}`;
}

/**
 * Fetch Federal Register documents for a date range with pagination.
 * Used by the backfill script — calls FR API directly (no caching).
 */
export async function fetchFederalRegisterHistorical(options: {
  agency?: string;
  type?: string;
  term?: string;
  dateFrom: string;
  dateTo: string;
  perPage?: number;
  delayMs?: number;
}): Promise<ContentItem[]> {
  const { agency, type, term, dateFrom, dateTo, perPage = 1000, delayMs = 200 } = options;
  const allItems: ContentItem[] = [];
  let page = 1;

  while (true) {
    const url = buildFrApiUrl({ agency, type, term }, page, dateFrom, dateTo, perPage);

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DemocracyMonitor/1.0 (backfill)',
      },
    });

    if (!response.ok) {
      console.error(`[fr-historical] HTTP ${response.status} for page ${page}`);
      break;
    }

    const data = await response.json();
    const results: Array<{
      title?: string;
      html_url?: string;
      publication_date?: string;
      agencies?: { name: string }[];
      type?: string;
      abstract?: string;
    }> = data.results || [];

    for (const doc of results) {
      allItems.push({
        title: doc.title || '(document)',
        link: doc.html_url,
        pubDate: doc.publication_date,
        agency: doc.agencies?.map((a) => a.name).join(', '),
        summary: doc.abstract ? truncate(stripHtml(doc.abstract)) : undefined,
        type: doc.type,
      });
    }

    if (results.length < perPage) break;
    page++;
    await sleep(delayMs);
  }

  return allItems;
}

/**
 * Parse a category signal URL to extract FR API parameters.
 */
export function parseSignalParams(signalUrl: string): {
  agency?: string;
  type?: string;
  term?: string;
} {
  const parsed = new URL(signalUrl, 'http://localhost');
  return {
    agency: parsed.searchParams.get('agency') || undefined,
    type: parsed.searchParams.get('type') || undefined,
    term: parsed.searchParams.get('term') || undefined,
  };
}
