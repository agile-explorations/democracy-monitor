import type { ContentItem } from '@/lib/types';
import { sleep } from '@/lib/utils/async';
import { fetchWithRetry } from '@/lib/utils/fetch-retry';

const FEC_API_BASE = 'https://api.open.fec.gov/v1';
const RATE_LIMIT_DELAY_MS = 4000; // FEC allows 1,000 req/hr with API key (~3.6s/req)
export const FEC_RETRY_BASE_DELAY_MS = 60_000; // FEC rate limits are aggressive — 60s base backoff
const FEC_WEB_BASE = 'https://www.fec.gov';
const MAX_SUMMARY_LENGTH = 800;

/** Ensure FEC URLs are absolute — the API returns relative paths like /legal/... */
function normalizeFecUrl(url: string | undefined | null): string | undefined {
  if (!url) return undefined;
  if (url.startsWith('http')) return url;
  // API returns /legal/... but the working web URL is /data/legal/...
  const path = url.startsWith('/legal/') ? `/data${url}` : url;
  return `${FEC_WEB_BASE}${path.startsWith('/') ? '' : '/'}${path}`;
}

type FecEndpointType = 'advisory_opinions' | 'murs' | 'admin_fines';

interface FecCitation {
  text?: string;
  title?: string;
  type?: string;
  url?: string;
}

interface FecDisposition {
  disposition?: string;
  penalty?: number | null;
  respondent?: string;
  citations?: FecCitation[];
}

interface FecParticipant {
  name?: string;
  role?: string;
}

export interface FecDocument {
  category?: string;
  description?: string;
  url?: string;
  length?: number;
  document_date?: string;
}

export interface FecAdvisoryOpinion {
  ao_no?: string;
  name?: string;
  summary?: string;
  issue_date?: string;
  status?: string;
  ao_citations?: Array<{ ao_no?: string }>;
  statutory_citations?: Array<{ section?: string; title?: number }>;
  regulatory_citations?: Array<{ part?: number; section?: number; title?: number }>;
  documents?: FecDocument[];
}

export interface FecMur {
  case_no?: string;
  name?: string;
  subject?: { primary?: string[]; secondary?: string[] };
  subjects?: Array<{ subject?: string }>;
  open_date?: string;
  close_date?: string;
  url?: string;
  respondents?: string[];
  participants?: FecParticipant[];
  commission_votes?: Array<{ action?: string; vote_date?: string }>;
  dispositions?: FecDisposition[];
  documents?: FecDocument[];
}

export interface FecLegalSearchResponse {
  advisory_opinions?: FecAdvisoryOpinion[];
  murs?: FecMur[];
  total_advisory_opinions?: number;
  total_murs?: number;
}

/**
 * Parse a fec:// pseudo-URL into API query parameters.
 * Format: fec://advisory-opinions?type=advisory_opinions
 */
export function parseFecParams(signalUrl: string): {
  endpointType: FecEndpointType;
} {
  const parsed = new URL(signalUrl.replace('fec://', 'http://fec/'));
  const type = (parsed.searchParams.get('type') || 'advisory_opinions') as FecEndpointType;
  return { endpointType: type };
}

function truncate(text: string): string {
  return text.length > MAX_SUMMARY_LENGTH ? text.slice(0, MAX_SUMMARY_LENGTH) + '\u2026' : text;
}

/** Format statutory citations as readable text. */
function formatStatutoryCitations(citations: Array<{ section?: string; title?: number }>): string {
  return citations.map((c) => `${c.title} USC §${c.section}`).join(', ');
}

/** Format regulatory citations as readable text. */
function formatRegulatoryCitations(
  citations: Array<{ part?: number; section?: number; title?: number }>,
): string {
  return citations.map((c) => `${c.title} CFR §${c.part}.${c.section}`).join(', ');
}

/** Convert an FEC advisory opinion to a ContentItem. */
export function aoToContentItem(ao: FecAdvisoryOpinion): ContentItem {
  const parts: string[] = [];

  if (ao.summary) parts.push(ao.summary);

  if (ao.statutory_citations?.length) {
    parts.push(`Statutes: ${formatStatutoryCitations(ao.statutory_citations)}`);
  }
  if (ao.regulatory_citations?.length) {
    parts.push(`Regulations: ${formatRegulatoryCitations(ao.regulatory_citations)}`);
  }

  return {
    title: ao.name || `Advisory Opinion ${ao.ao_no || '(unknown)'}`,
    link: ao.ao_no ? `https://www.fec.gov/data/legal/advisory-opinions/${ao.ao_no}/` : undefined,
    pubDate: ao.issue_date,
    agency: 'Federal Election Commission',
    content: parts.length ? truncate(parts.join('. ')) : undefined,
    type: 'advisory_opinion',
    sourceOrigin: 'fec',
  };
}

/** Build a structured summary for a MUR from its dispositions. */
function formatDispositions(dispositions: FecDisposition[]): string {
  // Group by disposition outcome, collecting unique respondents and citations
  const byOutcome = new Map<
    string,
    { respondents: string[]; citations: string[]; penalty: number }
  >();

  for (const d of dispositions) {
    const outcome = d.disposition || 'Unknown';
    if (!byOutcome.has(outcome)) {
      byOutcome.set(outcome, { respondents: [], citations: [], penalty: 0 });
    }
    const group = byOutcome.get(outcome)!;
    if (d.respondent && !group.respondents.includes(d.respondent)) {
      group.respondents.push(d.respondent);
    }
    if (d.penalty) group.penalty += d.penalty;
    for (const c of d.citations || []) {
      const cite = c.type === 'statute' ? `${c.title} USC §${c.text}` : `${c.title} CFR §${c.text}`;
      if (!group.citations.includes(cite)) group.citations.push(cite);
    }
  }

  const lines: string[] = [];
  for (const [outcome, group] of byOutcome) {
    let line = `${outcome}: ${group.respondents.join('; ')}`;
    if (group.penalty > 0) line += ` ($${group.penalty.toLocaleString('en-US')} penalty)`;
    if (group.citations.length) line += ` [${group.citations.join(', ')}]`;
    lines.push(line);
  }
  return lines.join('. ');
}

/** Convert an FEC MUR (Matter Under Review) to a ContentItem. */
export function murToContentItem(mur: FecMur): ContentItem {
  const parts: string[] = [];

  // Subjects — prefer new `subjects` array, fall back to old `subject.primary`
  const subjectNames = mur.subjects?.map((s) => s.subject).filter(Boolean) as string[] | undefined;
  const subjects = subjectNames?.length
    ? subjectNames.join(', ')
    : mur.subject?.primary?.join(', ') || '';
  if (subjects) parts.push(subjects);

  // Dispositions with statute citations and penalties
  if (mur.dispositions?.length) {
    parts.push(formatDispositions(mur.dispositions));
  }

  // Participants with roles (more informative than just respondent names)
  if (mur.participants?.length) {
    const byRole = new Map<string, string[]>();
    for (const p of mur.participants) {
      if (!p.name || !p.role) continue;
      if (!byRole.has(p.role)) byRole.set(p.role, []);
      byRole.get(p.role)!.push(p.name);
    }
    const roleParts: string[] = [];
    for (const [role, names] of byRole) {
      roleParts.push(`${role}: ${names.join('; ')}`);
    }
    if (roleParts.length) parts.push(roleParts.join('. '));
  } else if (mur.respondents?.length) {
    // Fallback to respondents list if no participants
    parts.push(`Respondents: ${mur.respondents.join('; ')}`);
  }

  // Commission votes — just the most recent action summary
  if (mur.commission_votes?.length) {
    const latest = mur.commission_votes[0];
    if (latest.action) {
      const actionPreview =
        latest.action.length > 200 ? latest.action.slice(0, 200) + '…' : latest.action;
      parts.push(`Commission action: ${actionPreview}`);
    }
  }

  const summary = parts.join('. ');

  return {
    title: mur.name || `MUR ${mur.case_no || '(unknown)'}`,
    link:
      normalizeFecUrl(mur.url) ||
      (mur.case_no
        ? `https://www.fec.gov/data/legal/matter-under-review/${mur.case_no}/`
        : undefined),
    pubDate: mur.open_date,
    agency: 'Federal Election Commission',
    content: summary ? truncate(summary) : undefined,
    type: 'enforcement_action',
    sourceOrigin: 'fec',
  };
}

export function getApiKey(): string | undefined {
  return process.env.FEC_API_KEY;
}

const PAGE_SIZE = 20; // FEC legal/search ignores per_page and returns 20 per request

export function buildSearchUrl(
  apiKey: string,
  type: string,
  extraParams?: Record<string, string>,
): string {
  const qs = new URLSearchParams({ api_key: apiKey, type, ...extraParams });
  return `${FEC_API_BASE}/legal/search/?${qs.toString()}`;
}

export const FEC_FETCH_INIT: RequestInit = {
  headers: { Accept: 'application/json', 'User-Agent': 'DemocracyMonitor/1.0' },
};

/** Fetch recent FEC data for the snapshot pipeline. */
export async function fetchFecRecent(params: {
  endpointType: FecEndpointType;
}): Promise<ContentItem[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[fec] FEC_API_KEY not set, skipping fetch');
    return [];
  }

  const url = buildSearchUrl(apiKey, params.endpointType);
  const response = await fetchWithRetry(url, FEC_FETCH_INIT, {
    baseDelayMs: FEC_RETRY_BASE_DELAY_MS,
    label: `fec-recent-${params.endpointType}`,
  });

  if (!response.ok) {
    console.error(`[fec] HTTP ${response.status}`);
    return [];
  }

  const data: FecLegalSearchResponse = await response.json();
  if (params.endpointType === 'advisory_opinions') {
    return (data.advisory_opinions || []).slice(0, 20).map(aoToContentItem);
  }
  return (data.murs || []).slice(0, 20).map(murToContentItem);
}

/** Fetch historical FEC data for the backfill pipeline. */
export async function fetchFecHistorical(params: {
  endpointType: FecEndpointType;
  dateFrom: string;
  dateTo: string;
  maxPages?: number;
}): Promise<ContentItem[]> {
  const apiKey = getApiKey();
  if (!apiKey) {
    console.log('[fec] FEC_API_KEY not set, skipping backfill');
    return [];
  }

  const { maxPages = 5 } = params;

  if (params.endpointType === 'advisory_opinions') {
    return fetchAoHistorical(apiKey, params.dateFrom, params.dateTo, maxPages);
  }
  return fetchMurHistorical(apiKey, params.dateFrom, params.dateTo, maxPages);
}

async function fetchAoHistorical(
  apiKey: string,
  dateFrom: string,
  dateTo: string,
  maxPages: number,
): Promise<ContentItem[]> {
  const allItems: ContentItem[] = [];

  for (let page = 0; page < maxPages; page++) {
    const fromHit = page * PAGE_SIZE;
    const url = buildSearchUrl(apiKey, 'advisory_opinions', {
      ao_min_issue_date: dateFrom,
      ao_max_issue_date: dateTo,
      from_hit: String(fromHit),
    });

    await sleep(RATE_LIMIT_DELAY_MS);
    let response: Response;
    try {
      response = await fetchWithRetry(url, FEC_FETCH_INIT, {
        baseDelayMs: FEC_RETRY_BASE_DELAY_MS,
        label: `fec-AO-${dateFrom}-p${page + 1}`,
      });
    } catch (err) {
      throw new Error(
        `[fec] Network error on AO ${dateFrom} p${page + 1}: ${err instanceof Error ? err.message : err}`,
      );
    }
    if (!response.ok) {
      throw new Error(`[fec] HTTP ${response.status} on AO ${dateFrom}`);
    }

    const data: FecLegalSearchResponse = await response.json();
    const results = data.advisory_opinions || [];
    if (results.length === 0) break;

    allItems.push(...results.map(aoToContentItem));
    if (results.length < PAGE_SIZE) break;
  }

  return allItems;
}

async function fetchMurHistorical(
  apiKey: string,
  dateFrom: string,
  dateTo: string,
  maxPages: number,
): Promise<ContentItem[]> {
  const allItems: ContentItem[] = [];

  for (let page = 0; page < maxPages; page++) {
    const fromHit = page * PAGE_SIZE;
    const url = buildSearchUrl(apiKey, 'murs', {
      case_min_open_date: dateFrom,
      case_max_open_date: dateTo,
      from_hit: String(fromHit),
    });

    await sleep(RATE_LIMIT_DELAY_MS);
    let response: Response;
    try {
      response = await fetchWithRetry(url, FEC_FETCH_INIT, {
        baseDelayMs: FEC_RETRY_BASE_DELAY_MS,
        label: `fec-MUR-${dateFrom}-p${page + 1}`,
      });
    } catch (err) {
      throw new Error(
        `[fec] Network error on MUR ${dateFrom} p${page + 1}: ${err instanceof Error ? err.message : err}`,
      );
    }
    if (!response.ok) {
      throw new Error(`[fec] HTTP ${response.status} on MUR ${dateFrom}`);
    }

    const data: FecLegalSearchResponse = await response.json();
    const results = data.murs || [];
    if (results.length === 0) break;

    allItems.push(...results.map(murToContentItem));
    if (results.length < PAGE_SIZE) break;
  }

  return allItems;
}

/**
 * Extract the case/AO number from a FEC document URL.
 * - MUR: https://www.fec.gov/data/legal/matter-under-review/8353/ → "8353"
 * - AO: https://www.fec.gov/data/legal/advisory-opinions/2024-07/ → "2024-07"
 */
export function parseFecDocUrl(url: string): { type: 'mur' | 'ao'; id: string } | null {
  const murMatch = url.match(/matter-under-review\/(\d+)/);
  if (murMatch) return { type: 'mur', id: murMatch[1] };
  const aoMatch = url.match(/advisory-opinions\/([\d-]+)/);
  if (aoMatch) return { type: 'ao', id: aoMatch[1] };
  return null;
}
