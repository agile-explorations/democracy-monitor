import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { fetchWithRetry } from '@/lib/utils/fetch-retry';

interface GdeltRawArticle {
  url?: string;
  title?: string;
  seendate?: string;
  domain?: string;
  sourcecountry?: string;
  tone?: number;
}

function parseGdeltArticles(articles: GdeltRawArticle[], dateFrom: string): ContentItem[] {
  return articles.map((article) => ({
    title: article.title || '(untitled)',
    link: article.url,
    pubDate: article.seendate ? formatGdeltDate(article.seendate) : dateFrom,
    agency: article.domain || 'GDELT',
    summary: article.tone !== undefined ? `Tone: ${article.tone.toFixed(1)}` : undefined,
    type: 'rhetoric',
    sourceOrigin: 'gdelt' as const,
  }));
}

/**
 * Fetch GDELT data for a date range with retry and rate-limit handling.
 * Uses the generic fetchWithRetry for 429/5xx/network retries.
 */
export async function fetchGdeltHistorical(options: {
  query: string;
  dateFrom: string;
  dateTo: string;
  maxRecords?: number;
  delayMs?: number;
}): Promise<ContentItem[]> {
  const { query, dateFrom, dateTo, maxRecords = 250, delayMs = 300 } = options;

  const params = new URLSearchParams({
    query,
    mode: 'ArtList',
    maxrecords: String(maxRecords),
    format: 'json',
    startdatetime: dateFrom.replace(/-/g, '') + '000000',
    enddatetime: dateTo.replace(/-/g, '') + '235959',
    sort: 'DateDesc',
  });

  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;

  try {
    await sleep(delayMs); // courtesy delay before request
    const response = await fetchWithRetry(
      url,
      { headers: { 'User-Agent': 'DemocracyMonitor/1.0 (backfill)', Accept: 'application/json' } },
      { baseDelayMs: 10_000, maxAttempts: 3, label: 'gdelt-historical' },
    );

    if (!response.ok) {
      console.error(`[gdelt-historical] HTTP ${response.status} after retries`);
      return [];
    }

    const text = await response.text();
    if (!text.startsWith('{')) {
      console.error('[gdelt-historical] Non-JSON 200 response, skipping');
      return [];
    }

    return parseGdeltArticles((JSON.parse(text).articles as GdeltRawArticle[]) || [], dateFrom);
  } catch (err) {
    if (err instanceof SyntaxError) {
      console.error('[gdelt-historical] Malformed JSON after retries');
    } else {
      console.error('[gdelt-historical] Fetch error:', err);
    }
    return [];
  }
}

/** GDELT queries relevant to executive power monitoring. Parentheses required for OR expressions. sourcecountry:US filters to US-sourced articles only. */
export const GDELT_QUERIES = [
  '("executive order" OR "presidential authority" OR "executive power") sourcecountry:US',
  '("press freedom" OR "journalist arrested" OR "FOIA denied") sourcecountry:US',
  '("election interference" OR "voter suppression" OR "election administration") sourcecountry:US',
  '("national emergency" OR "IEEPA" OR "insurrection act") sourcecountry:US',
  '("inspector general" OR "government oversight" OR "watchdog fired") sourcecountry:US',
];

function formatGdeltDate(gdeltDate: string): string {
  // GDELT dates are like "20250120T120000Z" or "20250120123000"
  const cleaned = gdeltDate.replace(/[TZ]/g, '');
  if (cleaned.length >= 8) {
    return `${cleaned.slice(0, 4)}-${cleaned.slice(4, 6)}-${cleaned.slice(6, 8)}`;
  }
  return gdeltDate;
}
