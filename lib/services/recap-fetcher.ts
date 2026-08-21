/**
 * RECAP document fetcher (#740): pull court-authored document text from
 * tracked criminal dockets. CL's signal-based ingest is structurally blind
 * to criminal dockets (NOS filters are civil-only; opinion court scopes
 * exclude vaed/njd), so the marquee prosecutions' primary documents never
 * arrived — this fetcher reads them straight off the docket.
 *
 * Reuses the courtlistener-fetcher client triple (CL_API_V4,
 * getAuthHeaders, fetchWithRetry + politeness delay). A SIBLING of
 * docket-timeline's page-1-only entries fetch: this one paginates fully and
 * keeps the recap_documents fields the timeline discards (id,
 * is_available, page_count). Pure filtering lives in recap-filter.ts.
 *
 * I/O module — excluded from unit coverage per the house fetcher pattern.
 */

import {
  CL_API_V4,
  CL_BASE_URL,
  getAuthHeaders,
  RATE_LIMIT_DELAY_MS,
} from '@/lib/services/courtlistener-fetcher';
import type { RecapDocumentMeta, RecapVerdict } from '@/lib/services/recap-filter';
import { classifyRecapDocument } from '@/lib/services/recap-filter';
import type { ContentItem } from '@/lib/types/assessment';
import { sleep } from '@/lib/utils/async';
import { fetchWithRetry } from '@/lib/utils/fetch-retry';

const ENTRIES_PAGE_SIZE = 100;
/** Hard page cap per docket. Entries ≫ documents (minute entries carry no
 *  recap_documents): the Comey docket holds 295 docs but >1,000 ENTRIES,
 *  and a 10-page ascending sweep silently dropped the newest filings —
 *  including the 2025-11-24 dismissal. Newest-first ordering (below) makes
 *  any truncation drop the old tail instead; 30 pages bounds runaways. */
const MAX_ENTRY_PAGES = 30;

interface ClRecapDocumentJson {
  id: number;
  description: string | null;
  is_available: boolean | null;
  page_count: number | null;
  filepath_local?: string | null;
}

interface ClDocketEntryJson {
  description: string | null;
  date_filed: string | null;
  entry_number: number | null;
  recap_documents: ClRecapDocumentJson[];
}

export interface RecapCandidate {
  recapId: number;
  docketId: number;
  entryNumber: number | null;
  dateFiled: string | null;
  description: string;
  verdict: RecapVerdict;
  pageCount: number | null;
}

/** Enumerate a docket's RECAP documents with ingest verdicts. */
export async function listDocketCandidates(docketId: number): Promise<RecapCandidate[]> {
  const candidates: RecapCandidate[] = [];
  let url: string | null =
    `${CL_API_V4}/docket-entries/?docket=${docketId}&order_by=-date_filed&page_size=${ENTRIES_PAGE_SIZE}`;
  let pages = 0;
  while (url && pages < MAX_ENTRY_PAGES) {
    const res = await fetchWithRetry(
      url,
      { headers: getAuthHeaders() },
      { label: `recap-entries:${docketId}` },
    );
    if (!res.ok) throw new Error(`docket-entries ${docketId}: HTTP ${res.status}`);
    const data = (await res.json()) as { results: ClDocketEntryJson[]; next: string | null };
    for (const entry of data.results) {
      for (const doc of entry.recap_documents ?? []) {
        const meta: RecapDocumentMeta = {
          id: doc.id,
          description: doc.description ?? '',
          entryDescription: entry.description ?? '',
          isAvailable: doc.is_available === true,
          pageCount: doc.page_count,
        };
        candidates.push({
          recapId: doc.id,
          docketId,
          entryNumber: entry.entry_number,
          dateFiled: entry.date_filed,
          description: `${entry.description ?? ''} — ${doc.description ?? ''}`.trim(),
          verdict: classifyRecapDocument(meta),
          pageCount: doc.page_count,
        });
      }
    }
    // Same-host guard as the fetcher's paginator: never follow a redirect
    // off courtlistener.
    url = data.next && data.next.startsWith(CL_BASE_URL) ? data.next : null;
    pages++;
    await sleep(RATE_LIMIT_DELAY_MS);
  }
  if (url) {
    console.warn(
      `[recap] docket ${docketId}: entry pagination CAPPED at ${MAX_ENTRY_PAGES} pages — oldest entries not scanned`,
    );
  }
  return candidates;
}

interface ClRecapDetailJson {
  id: number;
  plain_text: string | null;
  absolute_url: string | null;
  date_created: string | null;
}

/** Fetch one RECAP document's text; null when empty (OCR lag / sealed). */
export async function fetchRecapText(
  recapId: number,
): Promise<{ text: string; url: string } | null> {
  const res = await fetchWithRetry(
    `${CL_API_V4}/recap-documents/${recapId}/`,
    { headers: getAuthHeaders() },
    { label: `recap-doc:${recapId}` },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as ClRecapDetailJson;
  const text = (data.plain_text ?? '').trim();
  if (text.length === 0) return null;
  const url = data.absolute_url
    ? `${CL_BASE_URL}${data.absolute_url}`
    : `${CL_BASE_URL}/recap-documents/${recapId}/`;
  return { text, url };
}

/** Build the storable item for one ingested RECAP document. Mirrors
 *  buildOpinionContentItem's shape (judicial_opinion, cl: caseId). */
export function buildRecapContentItem(opts: {
  caseLabel: string;
  docketId: number;
  candidate: RecapCandidate;
  text: string;
  url: string;
}): ContentItem {
  return {
    title: `${opts.caseLabel} — ${opts.candidate.description}`.slice(0, 480),
    content: opts.text,
    link: opts.url,
    pubDate: opts.candidate.dateFiled ?? undefined,
    type: 'judicial_opinion',
    sourceOrigin: 'courtlistener',
    caseId: `cl:${opts.docketId}`,
    // Out of the documented counting population BY CONSTRUCTION (#587):
    // criminal-district orders were never part of the court-queries layer.
    // Retrieval/search/L2 evidence is their whole purpose — the embed
    // pipeline carves them in alongside fragments (#740).
    countingScope: false,
    metadata: {
      caseId: `cl:${opts.docketId}`,
      recapDocumentId: opts.candidate.recapId,
      entryNumber: opts.candidate.entryNumber,
      parentDocketUrl: `${CL_BASE_URL}/docket/${opts.docketId}/`,
      clQueries: ['recap-ingest:#740'],
    },
  };
}
