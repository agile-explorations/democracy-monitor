/**
 * FEC content enrichment for the backfill pipeline.
 * Re-fetches structured data from the FEC API and extracts PDF text
 * for final opinions, GC reports, and statements of reasons.
 */

import { fetchWithRetry } from '@/lib/utils/fetch-retry';
import { extractPdfText } from '@/lib/utils/pdf-extractor';
import type {
  FecAdvisoryOpinion,
  FecDocument,
  FecLegalSearchResponse,
  FecMur,
} from './fec-fetcher';
import {
  aoToContentItem,
  murToContentItem,
  parseFecDocUrl,
  getApiKey,
  buildSearchUrl,
  FEC_FETCH_INIT,
  FEC_RETRY_BASE_DELAY_MS,
} from './fec-fetcher';

const FEC_PDF_BASE = 'https://www.fec.gov';
const MAX_CONTENT_LENGTH = 8_000;

function truncateContent(text: string): string {
  return text.length > MAX_CONTENT_LENGTH ? text.slice(0, MAX_CONTENT_LENGTH) + '\u2026' : text;
}

/** Categories of FEC documents worth extracting PDF text from (priority order). */
const PRIORITY_DOC_CATEGORIES = [
  'Final Opinion',
  'General Counsel Reports, Briefs, Notifications and Responses',
  'Certifications',
  'Statement of Reasons',
];

/** Find the best PDF document from a FEC document list. */
function findPriorityPdf(documents: FecDocument[]): FecDocument | null {
  for (const category of PRIORITY_DOC_CATEGORIES) {
    const doc = documents.find((d) => d.category === category && d.url?.endsWith('.pdf'));
    if (doc) return doc;
  }
  return null;
}

/** Build full PDF URL from FEC relative path. */
function buildPdfUrl(relativePath: string): string {
  return relativePath.startsWith('http') ? relativePath : `${FEC_PDF_BASE}${relativePath}`;
}

/**
 * Re-fetch a single FEC document from the API and build enriched content.
 * Returns structured metadata summary + PDF text (if available).
 */
export async function fetchFecEnrichedContent(docUrl: string): Promise<string | null> {
  const apiKey = getApiKey();
  if (!apiKey) return null;

  const parsed = parseFecDocUrl(docUrl);
  if (!parsed) return null;

  const searchType = parsed.type === 'mur' ? 'murs' : 'advisory_opinions';
  const extraParams: Record<string, string> =
    parsed.type === 'mur' ? { case_no: parsed.id } : { ao_no: parsed.id };

  const url = buildSearchUrl(apiKey, searchType, extraParams);

  let response: Response;
  try {
    response = await fetchWithRetry(url, FEC_FETCH_INIT, {
      baseDelayMs: FEC_RETRY_BASE_DELAY_MS,
      label: `fec-enrich-${parsed.type}-${parsed.id}`,
    });
  } catch (err) {
    console.warn(`[fec-content] Fetch failed for ${docUrl}: ${err}`);
    return null;
  }
  if (!response.ok) return null;

  const data = (await response.json()) as FecLegalSearchResponse;

  if (parsed.type === 'mur') {
    const mur = data.murs?.[0] as FecMur | undefined;
    if (!mur) return null;

    const item = murToContentItem(mur);
    const parts: string[] = [];
    if (item.summary) parts.push(item.summary);

    const pdfDoc = findPriorityPdf(mur.documents || []);
    if (pdfDoc?.url) {
      const pdfText = await extractPdfText(buildPdfUrl(pdfDoc.url));
      if (pdfText) parts.push(pdfText);
    }

    return parts.length ? truncateContent(parts.join('\n\n')) : null;
  }

  // Advisory opinion
  const ao = data.advisory_opinions?.[0] as FecAdvisoryOpinion | undefined;
  if (!ao) return null;

  const item = aoToContentItem(ao);
  const parts: string[] = [];
  if (item.summary) parts.push(item.summary);

  const finalOpinion = ao.documents?.find(
    (d) => d.category === 'Final Opinion' && d.url?.endsWith('.pdf'),
  );
  if (finalOpinion?.url) {
    const pdfText = await extractPdfText(buildPdfUrl(finalOpinion.url));
    if (pdfText) parts.push(pdfText);
  }

  return parts.length ? truncateContent(parts.join('\n\n')) : null;
}
