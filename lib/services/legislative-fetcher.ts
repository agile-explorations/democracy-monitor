import { ASSESSMENT_RULES } from '@/lib/data/assessment-rules';
import type { LegislativeItem, LegislativeItemType } from '@/lib/types/legislative';
import { sleep } from '@/lib/utils/async';

/** Search terms for executive power oversight in congressional records. */
export const OVERSIGHT_SEARCH_TERMS = [
  'inspector general',
  'executive order',
  'subpoena',
  'oversight hearing',
  'confirmation vote',
  'appropriations hold',
  'impoundment',
  'contempt of congress',
  'executive privilege',
  'whistleblower',
  'government accountability',
  'presidential authority',
];

const DEFAULT_RATE_LIMIT_MS = 300;

interface GovInfoPackage {
  packageId?: string;
  title?: string;
  dateIssued?: string;
  packageLink?: string;
  congress?: string;
}

interface GovInfoCollectionResponse {
  packages?: GovInfoPackage[];
  nextPage?: string;
}

interface GovInfoSummary {
  title?: string;
  collectionCode?: string;
  category?: string;
  dateIssued?: string;
  download?: { txtLink?: string; pdfLink?: string };
  committees?: Array<{ committeeName?: string; chamber?: string }>;
}

/**
 * Classify a legislative item's relevance to dashboard categories
 * by matching title/summary text against assessment-rules keyword dictionaries.
 */
export function classifyLegislativeRelevance(title: string, summary?: string): string[] {
  const text = `${title} ${summary || ''}`.toLowerCase();
  const matched = new Set<string>();

  for (const [category, rules] of Object.entries(ASSESSMENT_RULES)) {
    const allKeywords = [
      ...rules.keywords.capture,
      ...rules.keywords.drift,
      ...rules.keywords.warning,
    ];
    for (const kw of allKeywords) {
      if (text.includes(kw.toLowerCase())) {
        matched.add(category);
        break;
      }
    }
  }

  return Array.from(matched);
}

/**
 * Infer a LegislativeItemType from a title string.
 */
function inferItemType(title: string): LegislativeItemType {
  const lower = title.toLowerCase();
  if (lower.includes('hearing') || lower.includes('testimony')) return 'hearing';
  if (lower.includes('resolution')) return 'resolution';
  if (lower.includes('report') || lower.includes('committee print')) return 'report';
  if (lower.includes('bill') || lower.includes('act of')) return 'bill';
  return 'floor_action';
}

/**
 * Infer chamber from GovInfo package metadata.
 */
function inferChamber(
  pkg: GovInfoPackage,
  summaryData?: GovInfoSummary,
): 'senate' | 'house' | 'joint' {
  const text =
    `${pkg.title || ''} ${summaryData?.category || ''} ${pkg.packageId || ''}`.toLowerCase();
  if (text.includes('joint')) return 'joint';
  if (text.includes('senate') || text.includes('sres') || text.includes('s.')) return 'senate';
  if (text.includes('house') || text.includes('hres') || text.includes('h.r.')) return 'house';
  return 'joint';
}

async function processGovInfoPackage(
  pkg: GovInfoPackage,
  apiKey: string,
  dateFromObj: Date,
  dateToObj: Date,
  dateFrom: string,
  delayMs: number,
): Promise<LegislativeItem | null> {
  if (!pkg.packageId || !pkg.title) return null;

  const pkgDate = pkg.dateIssued ? new Date(pkg.dateIssued) : null;
  if (pkgDate && (pkgDate > dateToObj || pkgDate < dateFromObj)) return null;

  const titleLower = pkg.title.toLowerCase();
  const isRelevant = OVERSIGHT_SEARCH_TERMS.some((term) => titleLower.includes(term));
  if (!isRelevant) return null;

  await sleep(delayMs);

  let summaryData: GovInfoSummary | undefined;
  try {
    const summaryUrl = `https://api.govinfo.gov/packages/${pkg.packageId}/summary?api_key=${apiKey}`;
    const summaryRes = await fetch(summaryUrl, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'DemocracyMonitor/1.0',
      },
    });
    if (summaryRes.ok) {
      summaryData = await summaryRes.json();
    }
  } catch {
    // Non-critical; continue without summary
  }

  const relevantCategories = classifyLegislativeRelevance(pkg.title, summaryData?.title);

  return {
    id: pkg.packageId,
    title: pkg.title,
    type: inferItemType(pkg.title),
    date: pkg.dateIssued || dateFrom,
    url: summaryData?.download?.pdfLink || `https://www.govinfo.gov/app/details/${pkg.packageId}`,
    chamber: inferChamber(pkg, summaryData),
    committee: summaryData?.committees?.[0]?.committeeName,
    relevantCategories,
    summary: summaryData?.title !== pkg.title ? summaryData?.title : undefined,
  };
}

/**
 * Fetch Congressional Record items from the GovInfo API for a date range.
 * Returns empty array if GOVINFO_API_KEY is not set (graceful degradation).
 */
export async function fetchCongressionalRecord(options: {
  dateFrom: string;
  dateTo: string;
  maxRecords?: number;
  delayMs?: number;
}): Promise<LegislativeItem[]> {
  const apiKey = process.env.GOVINFO_API_KEY;
  if (!apiKey) {
    console.log('[legislative] GOVINFO_API_KEY not set, skipping fetch');
    return [];
  }

  const { dateFrom, dateTo, maxRecords = 100, delayMs = DEFAULT_RATE_LIMIT_MS } = options;
  const items: LegislativeItem[] = [];

  try {
    const collectionUrl = `https://api.govinfo.gov/collections/CREC/${dateFrom}?offset=0&pageSize=${maxRecords}&api_key=${apiKey}`;
    const collectionRes = await fetch(collectionUrl, {
      headers: { Accept: 'application/json', 'User-Agent': 'DemocracyMonitor/1.0' },
    });

    if (!collectionRes.ok) {
      console.error(`[legislative] GovInfo collection HTTP ${collectionRes.status}`);
      return [];
    }

    const collectionData: GovInfoCollectionResponse = await collectionRes.json();
    const packages = collectionData.packages || [];
    const dateToObj = new Date(dateTo);
    const dateFromObj = new Date(dateFrom);

    for (const pkg of packages) {
      const item = await processGovInfoPackage(
        pkg,
        apiKey,
        dateFromObj,
        dateToObj,
        dateFrom,
        delayMs,
      );
      if (item) items.push(item);
    }
  } catch (err) {
    console.error('[legislative] Fetch error:', err);
    return [];
  }

  return items;
}
