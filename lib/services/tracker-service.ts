import type { CheerioAPI } from 'cheerio';
import type { TrackerConfig } from '@/lib/data/tracker-sources';

export interface TrackerItem {
  title: string;
  link?: string;
  date?: string;
}

export interface TrackerResult {
  type: string;
  source: string;
  sourceUrl: string;
  items: TrackerItem[];
  scrapedAt: string;
}

export function scrapeAndParse(
  $: CheerioAPI,
  config: TrackerConfig,
  source: string,
): TrackerResult {
  const items: TrackerItem[] = [];

  $(config.selector).each((_, elem) => {
    const $elem = $(elem);
    const title = $elem.find(config.titleSelector).first().text().trim();
    const link = $elem.find(config.linkSelector).first().attr('href');
    const date = config.dateSelector ? $elem.find(config.dateSelector).text().trim() : undefined;

    if (title && title.length > 3) {
      items.push({
        title,
        link: link?.startsWith('http')
          ? link
          : link
            ? new URL(link, config.url).toString()
            : config.url,
        date,
      });
    }
  });

  return {
    type: 'tracker_scrape',
    source,
    sourceUrl: config.url,
    items: items.slice(0, 15),
    scrapedAt: new Date().toISOString(),
  };
}
