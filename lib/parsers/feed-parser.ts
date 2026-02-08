export interface FeedItem {
  title: string;
  summary?: string;
  link?: string;
  pubDate?: string;
  agency?: string;
  date?: string;
  isError?: boolean;
  isWarning?: boolean;
}

interface FeedPayloadItem {
  title?: string | { _?: string };
  link?: string | { href?: string; _?: string };
  id?: string;
  pubDate?: string;
  published?: string;
  updated?: string;
  date?: string;
  agency?: string;
  text?: string;
  href?: string;
  summary?: string;
  description?: string | { _?: string };
  'content:encoded'?: string;
}

export interface FeedPayload {
  type?: string;
  items?: FeedPayloadItem[];
  sourceUrl?: string;
  data?: {
    type?: string;
    error?: string;
    items?: FeedPayloadItem[];
    anchors?: FeedPayloadItem[];
    json?: FeedItem[];
  };
}

const MAX_SUMMARY_LENGTH = 800;

/** Strip HTML tags, decode common entities, and collapse whitespace */
export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractSummary(item: FeedPayloadItem): string | undefined {
  const raw =
    item['content:encoded'] ||
    (typeof item.description === 'string' ? item.description : item.description?._) ||
    item.summary;
  if (!raw) return undefined;
  const text = stripHtml(raw);
  return text.length > MAX_SUMMARY_LENGTH ? text.slice(0, MAX_SUMMARY_LENGTH) + '…' : text;
}

export function parseResult(payload: FeedPayload, signalType: string, baseUrl: string): FeedItem[] {
  // Handle Federal Register API responses
  if (signalType === 'federal_register' || payload?.type === 'federal_register') {
    const items = payload?.items || [];
    if (items.length === 0) {
      return [{ title: 'No recent documents found', link: baseUrl, isWarning: true }];
    }
    return items.slice(0, 8).map((it) => ({
      title: (typeof it.title === 'string' ? it.title : it.title?._) || '(document)',
      summary: extractSummary(it),
      link: typeof it.link === 'string' ? it.link : undefined,
      pubDate: it.pubDate,
      agency: it.agency,
    }));
  }

  // Handle tracker scrape responses
  if (signalType === 'tracker_scrape' || payload?.type === 'tracker_scrape') {
    const items = payload?.items || [];
    if (items.length === 0) {
      return [
        {
          title: 'No items found - tracker may have changed structure',
          link: payload?.sourceUrl || baseUrl,
          isWarning: true,
        },
      ];
    }
    return items.slice(0, 10).map((it) => ({
      title: (typeof it.title === 'string' ? it.title : it.title?._) || '(item)',
      link: typeof it.link === 'string' ? it.link : undefined,
      date: it.date,
    }));
  }

  const d = payload?.data || {};

  if (d.type === 'error') {
    return [{ title: `Error: ${d.error || 'Unknown error'}`, link: baseUrl, isError: true }];
  }

  if (d.type === 'rss') {
    const items = d.items || [];
    return items.slice(0, 8).map((it) => {
      const title = typeof it.title === 'string' ? it.title : it.title?._;
      const link =
        typeof it.link === 'string'
          ? it.link
          : (it.link as { href?: string })?.href || (it.link as { _?: string })?._ || it.id;
      const pubDate = it.pubDate || it.published || it.updated;

      return {
        title: title || '(item)',
        summary: extractSummary(it),
        link: link,
        pubDate: pubDate,
      };
    });
  }

  if (d.type === 'html') {
    const anchors = d.anchors || [];
    if (anchors.length === 0) {
      return [
        { title: 'No links found - site may be blocking requests', link: baseUrl, isWarning: true },
      ];
    }
    return anchors.slice(0, 10).map((a) => ({
      title: a.text || a.href || '(link)',
      link: a.href,
    }));
  }

  if (d.type === 'json') {
    return Array.isArray(d.json) ? d.json : [{ title: '(json data)', link: baseUrl }];
  }

  return [{ title: 'No data available', link: baseUrl, isWarning: true }];
}
