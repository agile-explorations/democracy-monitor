import { cacheGet, cacheSet } from '@/lib/cache';
import { SCRAPE_CACHE_TTL_S } from '@/lib/data/cache-config';
import { RHETORIC_KEYWORDS, ACTION_KEYWORDS } from '@/lib/data/intent-keywords';
import type { ContentItem } from '@/lib/types/assessment';
import type { IntentStatement, PolicyArea } from '@/lib/types/intent';
import { toDateString } from '@/lib/utils/date-utils';
import { matchKeyword } from '@/lib/utils/keyword-match';

export async function fetchPresidentialDocuments(): Promise<IntentStatement[]> {
  const cacheKey = 'intent:presidential-docs';
  const cached = await cacheGet<IntentStatement[]>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      per_page: '20',
      order: 'newest',
      'conditions[type][]': 'PRESDOCU',
    });
    const url = `https://www.federalregister.gov/api/v1/documents.json?${params}`;

    const response = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DemocracyMonitor/2.0',
      },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const statements: IntentStatement[] = (data.results || []).map(
      (doc: {
        title?: string;
        abstract?: string;
        type?: string;
        publication_date?: string;
        html_url?: string;
      }) => {
        const text = `${doc.title || ''} ${doc.abstract || ''}`;
        const policyArea = classifyPolicyArea(text);
        const type = classifyType(doc.type || '', text);
        const score = quickScore(text, type, policyArea);

        return {
          text: doc.title,
          source: 'Federal Register',
          sourceTier: 1 as const,
          type,
          policyArea,
          score,
          date: doc.publication_date,
          url: doc.html_url,
        };
      },
    );

    await cacheSet(cacheKey, statements, SCRAPE_CACHE_TTL_S);
    return statements;
  } catch (err) {
    console.warn('Failed to fetch presidential documents:', err);
    return [];
  }
}

export async function fetchWhiteHouseBriefings(): Promise<IntentStatement[]> {
  return fetchRssFeed(
    'https://www.whitehouse.gov/briefings-statements/feed/',
    'intent:wh-briefings',
    'White House',
    1,
    /<link>(https:\/\/www\.whitehouse\.gov[^<]*)<\/link>/g,
  );
}

async function fetchRssFeed(
  feedUrl: string,
  cacheKey: string,
  sourceName: string,
  sourceTier: 1 | 2,
  linkPattern: RegExp,
): Promise<IntentStatement[]> {
  const cached = await cacheGet<IntentStatement[]>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(feedUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DemocracyDashboard/2.0)',
        Accept: 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) return [];

    const text = await response.text();
    const items: IntentStatement[] = [];

    const titleMatches = text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
    const linkMatches = text.matchAll(linkPattern);

    const titles = Array.from(titleMatches).map((m) => m[1]);
    const links = Array.from(linkMatches).map((m) => m[1]);

    for (let i = 0; i < Math.min(titles.length, links.length, 15); i++) {
      const titleText = titles[i];
      if (!titleText) continue;

      const policyArea = classifyPolicyArea(titleText);
      const type = 'rhetoric' as const;
      const score = quickScore(titleText, type, policyArea);

      items.push({
        text: titleText,
        source: sourceName,
        sourceTier,
        type,
        policyArea,
        score,
        date: toDateString(new Date()),
        url: links[i],
      });
    }

    await cacheSet(cacheKey, items, SCRAPE_CACHE_TTL_S);
    return items;
  } catch (err) {
    console.warn(`Failed to fetch RSS feed ${feedUrl}:`, err);
    return [];
  }
}

export async function fetchNPRPolitics(): Promise<IntentStatement[]> {
  return fetchRssFeed(
    'https://feeds.npr.org/1014/rss.xml',
    'intent:npr-politics',
    'NPR Politics',
    2,
    /<link>(https:\/\/www\.npr\.org[^<]*)<\/link>/g,
  );
}

export async function fetchAPPolitics(): Promise<IntentStatement[]> {
  return fetchRssFeed(
    'https://apnews.com/politics.rss',
    'intent:ap-politics',
    'AP News',
    2,
    /<link>(https:\/\/apnews\.com[^<]*)<\/link>/g,
  );
}

export async function fetchGoogleNewsRhetoric(): Promise<IntentStatement[]> {
  return fetchRssFeed(
    'https://news.google.com/rss/search?q=%22executive+power%22+OR+%22presidential+authority%22+OR+%22executive+order%22&hl=en-US&gl=US&ceid=US:en',
    'intent:google-news-rhetoric',
    'Google News',
    2,
    /<link>(https?:\/\/[^<]*)<\/link>/g,
  );
}

export async function fetchAllRhetoricSources(): Promise<IntentStatement[]> {
  const results = await Promise.allSettled([
    fetchPresidentialDocuments(),
    fetchWhiteHouseBriefings(),
    fetchNPRPolitics(),
    fetchAPPolitics(),
    fetchGoogleNewsRhetoric(),
  ]);

  return results.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));
}

export function statementsToContentItems(statements: IntentStatement[]): ContentItem[] {
  return statements
    .filter((s) => s.url)
    .map((s) => ({
      title: s.text,
      link: s.url,
      pubDate: s.date,
      agency: s.source,
      type: s.type,
    }));
}

function classifyPolicyArea(text: string): PolicyArea {
  const areas: PolicyArea[] = [
    'rule_of_law',
    'civil_liberties',
    'elections',
    'media_freedom',
    'institutional_independence',
  ];

  let bestArea: PolicyArea = 'rule_of_law';
  let bestScore = 0;

  for (const area of areas) {
    const rhetoricKws = RHETORIC_KEYWORDS[area];
    const actionKws = ACTION_KEYWORDS[area];
    let count = 0;

    for (const kw of [
      ...rhetoricKws.authoritarian,
      ...rhetoricKws.democratic,
      ...actionKws.authoritarian,
      ...actionKws.democratic,
    ]) {
      if (matchKeyword(text, kw)) count++;
    }

    if (count > bestScore) {
      bestScore = count;
      bestArea = area;
    }
  }

  return bestArea;
}

function classifyType(_docType: string, text: string): 'rhetoric' | 'action' {
  const lower = text.toLowerCase();
  const actionWords = [
    'executive order',
    'proclamation',
    'memorandum',
    'directive',
    'order',
    'signed',
  ];
  const hasActionWord = actionWords.some((w) => lower.includes(w));
  return hasActionWord ? 'action' : 'rhetoric';
}

function quickScore(text: string, type: 'rhetoric' | 'action', area: PolicyArea): number {
  const keywords = type === 'rhetoric' ? RHETORIC_KEYWORDS[area] : ACTION_KEYWORDS[area];

  let authCount = 0;
  let demoCount = 0;

  for (const kw of keywords.authoritarian) {
    if (matchKeyword(text, kw)) authCount++;
  }
  for (const kw of keywords.democratic) {
    if (matchKeyword(text, kw)) demoCount++;
  }

  if (authCount === 0 && demoCount === 0) return 0;
  return Math.round(((authCount - demoCount) / (authCount + demoCount)) * 2 * 100) / 100;
}
