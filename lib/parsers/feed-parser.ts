export interface FeedItem {
  title: string;
  link?: string;
  pubDate?: string;
  agency?: string;
  date?: string;
  isError?: boolean;
  isWarning?: boolean;
}

export function parseResult(payload: any, signalType: string, baseUrl: string): FeedItem[] {
  // Handle Federal Register API responses
  if (signalType === 'federal_register' || payload?.type === 'federal_register') {
    const items = payload?.items || [];
    if (items.length === 0) {
      return [{ title: 'No recent documents found', link: baseUrl, isWarning: true }];
    }
    return items.slice(0, 8).map((it: any) => ({
      title: it.title || '(document)',
      link: it.link,
      pubDate: it.pubDate,
      agency: it.agency
    }));
  }

  // Handle tracker scrape responses
  if (signalType === 'tracker_scrape' || payload?.type === 'tracker_scrape') {
    const items = payload?.items || [];
    if (items.length === 0) {
      return [{ title: 'No items found - tracker may have changed structure', link: payload?.sourceUrl || baseUrl, isWarning: true }];
    }
    return items.slice(0, 10).map((it: any) => ({
      title: it.title,
      link: it.link,
      date: it.date
    }));
  }

  const d = payload?.data || {};

  if (d.type === 'error') {
    return [{ title: `Error: ${d.error || 'Unknown error'}`, link: baseUrl, isError: true }];
  }

  if (d.type === 'rss') {
    const items = d.items || [];
    return items.slice(0, 8).map((it: any) => {
      const title = typeof it.title === 'string' ? it.title : it.title?._ || it.title;
      const link = typeof it.link === 'string' ? it.link : it.link?.href || it.link?._ || it.id;
      const pubDate = it.pubDate || it.published || it.updated;

      return {
        title: title || '(item)',
        link: link,
        pubDate: pubDate
      };
    });
  }

  if (d.type === 'html') {
    const anchors = d.anchors || [];
    if (anchors.length === 0) {
      return [{ title: 'No links found - site may be blocking requests', link: baseUrl, isWarning: true }];
    }
    return anchors.slice(0, 10).map((a: any) => ({
      title: a.text || a.href,
      link: a.href
    }));
  }

  if (d.type === 'json') {
    return Array.isArray(d.json) ? d.json : [{ title: '(json data)', link: baseUrl }];
  }

  return [{ title: 'No data available', link: baseUrl, isWarning: true }];
}
