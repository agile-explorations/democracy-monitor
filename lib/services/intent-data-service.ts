import type { IntentStatement, PolicyArea } from '@/lib/types/intent';
import { RHETORIC_KEYWORDS, ACTION_KEYWORDS } from '@/lib/data/intent-keywords';
import { cacheGet, cacheSet } from '@/lib/cache';
import { matchKeyword } from '@/lib/utils/keyword-match';

const CACHE_TTL_S = 3600; // 1 hour

export async function fetchPresidentialDocuments(): Promise<IntentStatement[]> {
  const cacheKey = 'intent:presidential-docs';
  const cached = await cacheGet<IntentStatement[]>(cacheKey);
  if (cached) return cached;

  try {
    const params = new URLSearchParams({
      'per_page': '20',
      'order': 'newest',
      'conditions[type][]': 'PRESDOCU',
    });
    const url = `https://www.federalregister.gov/api/v1/documents.json?${params}`;

    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'ExecutivePowerDriftDashboard/2.0',
      },
    });

    if (!response.ok) return [];

    const data = await response.json();
    const statements: IntentStatement[] = (data.results || []).map((doc: any) => {
      const text = `${doc.title || ''} ${doc.abstract || ''}`;
      const policyArea = classifyPolicyArea(text);
      const type = classifyType(doc.type, text);
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
    });

    await cacheSet(cacheKey, statements, CACHE_TTL_S);
    return statements;
  } catch {
    return [];
  }
}

export async function fetchWhiteHouseBriefings(): Promise<IntentStatement[]> {
  const cacheKey = 'intent:wh-briefings';
  const cached = await cacheGet<IntentStatement[]>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch('https://www.whitehouse.gov/briefing-room/feed/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DemocracyDashboard/2.0)',
        'Accept': 'application/rss+xml, application/xml, text/xml',
      },
    });

    if (!response.ok) return [];

    // Parse as text — actual XML parsing would need xml2js
    // For now, extract basic items from the feed
    const text = await response.text();
    const items: IntentStatement[] = [];

    const titleMatches = text.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
    const linkMatches = text.matchAll(/<link>(https:\/\/www\.whitehouse\.gov[^<]*)<\/link>/g);

    const titles = Array.from(titleMatches).map(m => m[1]);
    const links = Array.from(linkMatches).map(m => m[1]);

    for (let i = 0; i < Math.min(titles.length, links.length, 15); i++) {
      const titleText = titles[i];
      if (!titleText) continue;

      const policyArea = classifyPolicyArea(titleText);
      const type = 'rhetoric' as const;
      const score = quickScore(titleText, type, policyArea);

      items.push({
        text: titleText,
        source: 'White House',
        sourceTier: 1,
        type,
        policyArea,
        score,
        date: new Date().toISOString().split('T')[0],
        url: links[i],
      });
    }

    await cacheSet(cacheKey, items, CACHE_TTL_S);
    return items;
  } catch {
    return [];
  }
}

function classifyPolicyArea(text: string): PolicyArea {
  const areas: PolicyArea[] = [
    'rule_of_law', 'civil_liberties', 'elections',
    'media_freedom', 'institutional_independence',
  ];

  let bestArea: PolicyArea = 'rule_of_law';
  let bestScore = 0;

  for (const area of areas) {
    const rhetoricKws = RHETORIC_KEYWORDS[area];
    const actionKws = ACTION_KEYWORDS[area];
    let count = 0;

    for (const kw of [...rhetoricKws.authoritarian, ...rhetoricKws.democratic, ...actionKws.authoritarian, ...actionKws.democratic]) {
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
  const actionWords = ['executive order', 'proclamation', 'memorandum', 'directive', 'order', 'signed'];
  const hasActionWord = actionWords.some(w => lower.includes(w));
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
