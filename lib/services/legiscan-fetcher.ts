import AdmZip from 'adm-zip';
import {
  LEGISCAN_BROAD_TERMS,
  LEGISCAN_SUBJECT_MAP,
  TOPIC_ROUTING_TERMS,
} from '@/lib/data/topic-routing-terms';
import { matchesTerm } from '@/lib/services/crec-classifier';
import { classifyLegislativeRelevance } from '@/lib/services/legislative-fetcher';
import type { ContentItem } from '@/lib/types';

const LEGISCAN_API_BASE = 'https://api.legiscan.com/';

/** LegiScan bill object from bulk dataset JSON. */
export interface LegiScanBill {
  bill_id: number;
  bill_number: string;
  bill_type: string;
  title: string;
  description: string;
  status: number;
  status_date: string;
  url: string;
  state: string;
  state_link: string;
  session_id: number;
  session: { session_id: number; year_start: number; year_end: number };
  body: string;
  current_body: string;
  subjects: Array<{ subject_id: number; subject_name: string }>;
  sponsors: Array<{
    people_id: number;
    party: string;
    name: string;
    sponsor_type_id: number;
  }>;
}

/** Entry from getDatasetList response. */
export interface LegiScanDatasetEntry {
  state_id: number;
  session_id: number;
  year_start: number;
  year_end: number;
  special: number;
  session_name: string;
  session_title: string;
  dataset_hash: string;
  dataset_date: string;
  dataset_size: number;
  access_key: string;
}

/** API response wrapper. */
interface LegiScanApiResponse<T> {
  status: string;
  alert?: { message: string };
  datasetlist?: T[];
  dataset?: {
    state_id: number;
    session_id: number;
    session_name: string;
    dataset_hash: string;
    dataset_date: string;
    dataset_size: number;
    mime: string;
    zip: string;
  };
}

export function getApiKey(): string {
  const key = process.env.LEGISCAN_API_KEY;
  if (!key) throw new Error('LEGISCAN_API_KEY environment variable not set');
  return key;
}

/** Fetch available session datasets for a state (e.g. 'US' for Congress). */
export async function fetchDatasetList(state: string): Promise<LegiScanDatasetEntry[]> {
  const apiKey = getApiKey();
  const url = `${LEGISCAN_API_BASE}?key=${apiKey}&op=getDatasetList&state=${state}`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'DemocracyMonitor/1.0' },
  });

  if (!res.ok) {
    throw new Error(`LegiScan getDatasetList HTTP ${res.status}`);
  }

  const data: LegiScanApiResponse<LegiScanDatasetEntry> = await res.json();

  if (data.status !== 'OK') {
    throw new Error(`LegiScan API error: ${data.alert?.message || 'unknown'}`);
  }

  return data.datasetlist || [];
}

/** Download and extract a dataset ZIP, returning parsed bill JSON objects. */
export async function fetchDataset(
  sessionId: number,
  accessKey: string,
): Promise<{ bills: LegiScanBill[]; hash: string }> {
  const apiKey = getApiKey();
  const url = `${LEGISCAN_API_BASE}?key=${apiKey}&op=getDataset&id=${sessionId}&access_key=${accessKey}`;

  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': 'DemocracyMonitor/1.0' },
  });

  if (!res.ok) {
    throw new Error(`LegiScan getDataset HTTP ${res.status}`);
  }

  const data: LegiScanApiResponse<never> = await res.json();

  if (data.status !== 'OK' || !data.dataset) {
    throw new Error(`LegiScan getDataset error: ${data.alert?.message || 'no dataset returned'}`);
  }

  const zipBuffer = Buffer.from(data.dataset.zip, 'base64');
  // Free the base64 string (~61 MB for 119th Congress) for GC
  data.dataset.zip = '';
  const zip = new AdmZip(zipBuffer);
  const bills: LegiScanBill[] = [];

  for (const entry of zip.getEntries()) {
    if (!entry.entryName.includes('/bill/') || entry.isDirectory) continue;
    if (!entry.entryName.endsWith('.json')) continue;

    try {
      const content = entry.getData().toString('utf8');
      const parsed = JSON.parse(content);
      if (parsed.bill) {
        bills.push(parsed.bill);
      }
    } catch {
      // Skip malformed entries
    }
  }

  return { bills, hash: data.dataset.dataset_hash };
}

/** Convert a LegiScan bill to a ContentItem for storage via storeDocuments. */
export function parseBillToContentItem(bill: LegiScanBill): ContentItem {
  return {
    title: bill.title,
    summary: bill.description || undefined,
    link: bill.url || bill.state_link,
    pubDate: bill.status_date,
    type: 'bill',
    sourceOrigin: 'legiscan',
    agency: inferChamber(bill),
  };
}

/** Build metadata object for LegiScan bill storage. */
export function buildBillMetadata(bill: LegiScanBill): Record<string, string | number | string[]> {
  const meta: Record<string, string | number | string[]> = {
    bill_id: bill.bill_id,
    bill_number: bill.bill_number,
    status: bill.status,
    state: bill.state,
    session_id: bill.session_id,
  };

  if (bill.subjects?.length > 0) {
    meta.subjects = bill.subjects.map((s) => s.subject_name);
  }

  const partyBreakdown = buildSponsorPartyBreakdown(bill.sponsors);
  if (partyBreakdown) {
    meta.sponsor_party_breakdown = partyBreakdown;
  }

  return meta;
}

/** Classify bill into dashboard categories using title + description + subject filtering. */
export function classifyBill(bill: LegiScanBill): string[] {
  const categories = classifyLegislativeRelevance(bill.title, bill.description);
  if (categories.length === 0) return categories;
  return filterBySubjectRelevance(categories, bill);
}

/**
 * Filter categories matched by broad terms unless confirmed by bill subjects.
 *
 * For each matched category:
 * - If category has no broad terms defined → keep
 * - If bill text matches a non-broad term for this category → keep
 * - Otherwise (only broad terms matched):
 *   - If bill has no subjects → keep (fallback for ~2% without subjects)
 *   - If any bill subject is in LEGISCAN_SUBJECT_MAP for this category → keep
 *   - Otherwise → drop
 */
export function filterBySubjectRelevance(categories: string[], bill: LegiScanBill): string[] {
  const searchText = `${bill.title} ${bill.description}`.toLowerCase();
  const billSubjects = bill.subjects?.map((s) => s.subject_name) ?? [];

  return categories.filter((category) => {
    const broadTerms = LEGISCAN_BROAD_TERMS[category];
    if (!broadTerms) return true;

    const allTerms = TOPIC_ROUTING_TERMS[category] ?? [];
    const nonBroadTerms = allTerms.filter((t) => !broadTerms.includes(t));
    const matchedSpecific = nonBroadTerms.some((term) => matchesTerm(searchText, term));
    if (matchedSpecific) return true;

    // Only broad terms matched — require subject confirmation
    if (billSubjects.length === 0) return true;

    const validSubjects = LEGISCAN_SUBJECT_MAP[category] ?? [];
    return billSubjects.some((s) => validSubjects.includes(s));
  });
}

/** Check if a bill's status_date falls within a date range (inclusive). */
export function isBillInDateRange(
  bill: LegiScanBill,
  rangeStart: string,
  rangeEnd: string,
): boolean {
  const statusDate = bill.status_date;
  if (!statusDate) return false;
  return statusDate >= rangeStart && statusDate <= rangeEnd;
}

function inferChamber(bill: LegiScanBill): string {
  const body = (bill.body || bill.current_body || '').toLowerCase();
  if (body.includes('senate') || body === 's') return 'US Senate';
  if (body.includes('house') || body === 'h') return 'US House';
  return 'US Congress';
}

function buildSponsorPartyBreakdown(sponsors: LegiScanBill['sponsors']): string | null {
  if (!sponsors || sponsors.length === 0) return null;

  const counts: Record<string, number> = {};
  for (const s of sponsors) {
    const party = s.party || 'Unknown';
    counts[party] = (counts[party] || 0) + 1;
  }

  return Object.entries(counts)
    .map(([party, count]) => `${party}:${count}`)
    .join(',');
}
