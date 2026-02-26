import {
  fetchCourtListenerHistorical,
  parseCourtListenerParams,
} from '@/lib/services/courtlistener-fetcher';
import { fetchDojHistorical, parseDojSignalParams } from '@/lib/services/doj-fetcher';
import { fetchFecHistorical, parseFecParams } from '@/lib/services/fec-fetcher';
import {
  fetchFederalRegisterHistorical,
  parseSignalParams,
} from '@/lib/services/federal-register-fetcher';
import { fetchGovInfoHistorical, parseGovInfoParams } from '@/lib/services/govinfo-fetcher';
import type { ContentItem } from '@/lib/types';

interface WeekRange {
  start: string;
  end: string;
}

export async function fetchWeekItemsFr(
  frSignals: Array<{ url: string; type: string }>,
  week: WeekRange,
  categoryKey: string,
): Promise<ContentItem[]> {
  const weekItems: ContentItem[] = [];

  for (const signal of frSignals) {
    const params = parseSignalParams(signal.url);
    try {
      const items = await fetchFederalRegisterHistorical({
        ...params,
        dateFrom: week.start,
        dateTo: week.end,
        perPage: 1000,
        delayMs: 200,
      });
      weekItems.push(...items);
    } catch (err) {
      console.error(`  [${categoryKey}] FR fetch error for ${week.start}:`, err);
    }
  }

  return weekItems;
}

export async function fetchWeekItemsCourtListener(
  signals: Array<{ url: string; type: string }>,
  week: WeekRange,
  categoryKey: string,
): Promise<ContentItem[]> {
  const items: ContentItem[] = [];
  for (const signal of signals) {
    const params = parseCourtListenerParams(signal.url);
    try {
      const fetched = await fetchCourtListenerHistorical({
        ...params,
        dateFrom: week.start,
        dateTo: week.end,
      });
      items.push(...fetched);
    } catch (err) {
      console.error(`  [${categoryKey}] CourtListener fetch error for ${week.start}:`, err);
    }
  }
  return items;
}

export async function fetchWeekItemsDoj(
  signals: Array<{ url: string; type: string }>,
  week: WeekRange,
  categoryKey: string,
): Promise<ContentItem[]> {
  const items: ContentItem[] = [];
  for (const signal of signals) {
    const params = parseDojSignalParams(signal.url);
    try {
      const fetched = await fetchDojHistorical({
        ...params,
        dateFrom: week.start,
        dateTo: week.end,
      });
      items.push(...fetched);
    } catch (err) {
      console.error(`  [${categoryKey}] DOJ fetch error for ${week.start}:`, err);
    }
  }
  return items;
}

export async function fetchWeekItemsGovInfo(
  signals: Array<{ url: string; type: string }>,
  week: WeekRange,
  categoryKey: string,
): Promise<ContentItem[]> {
  const items: ContentItem[] = [];
  for (const signal of signals) {
    const params = parseGovInfoParams(signal.url);
    try {
      const fetched = await fetchGovInfoHistorical({
        ...params,
        dateFrom: week.start,
        dateTo: week.end,
      });
      items.push(...fetched);
    } catch (err) {
      console.error(`  [${categoryKey}] GovInfo fetch error for ${week.start}:`, err);
    }
  }
  return items;
}

export async function fetchWeekItemsFec(
  signals: Array<{ url: string; type: string }>,
  week: WeekRange,
  categoryKey: string,
): Promise<ContentItem[]> {
  const items: ContentItem[] = [];
  for (const signal of signals) {
    const params = parseFecParams(signal.url);
    try {
      const fetched = await fetchFecHistorical({
        ...params,
        dateFrom: week.start,
        dateTo: week.end,
      });
      items.push(...fetched);
    } catch (err) {
      console.error(`  [${categoryKey}] FEC fetch error for ${week.start}:`, err);
    }
  }
  return items;
}
