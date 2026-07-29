import { formatError } from '@/lib/utils/api-helpers';

// pdf-parse v1 eagerly loads a test PDF at import time, breaking vitest.
// Lazy-require avoids this — the module is only loaded when actually called.
type PdfParseResult = { text: string };
type PdfParseFn = (buffer: Buffer, options?: { max?: number }) => Promise<PdfParseResult>;

const FETCH_TIMEOUT_MS = 60_000;
// Bandwidth/buffer sanity bound, NOT a content decision (#607): parse-time
// heap is bounded by MAX_PAGES_PARSED, so the byte limit only caps the
// transient download buffer. 64 MB covers every report seen (max 29.5 MB).
const DOWNLOAD_BYTE_LIMIT = 64 * 1024 * 1024;
// We store at most MAX_CONTENT_LENGTH chars (~3-4 text pages), so parsing 20
// pages always suffices for text PDFs while keeping memory size-independent.
// Tradeoff: a sparse-text PDF whose first 20 pages hold <8,000 chars yields
// less text than a full parse would — accepted; the alternative is the
// unbounded parse heap that OOM-risks the weekly cron.
const MAX_PAGES_PARSED = 20;
const MAX_CONTENT_LENGTH = 8_000;

/**
 * Read a response body chunk-wise, aborting once it exceeds maxBytes.
 * Closes the hole where a server that omits content-length gets fully
 * buffered into RAM before any size check can fire.
 */
export async function readBodyWithLimit(
  response: Response,
  maxBytes: number,
): Promise<Buffer | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      console.warn(`[pdf-extractor] Aborting download over ${maxBytes} bytes`);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

/**
 * Download a PDF from a URL and extract its text content.
 * Returns null for corrupt, password-protected, oversized, or unreachable PDFs.
 * Parsing stops after MAX_PAGES_PARSED pages; text is truncated to
 * MAX_CONTENT_LENGTH characters.
 *
 * `parse` is a test seam: pdf-parse must stay a lazy CJS require (its v1
 * import-time debug harness breaks under vitest and dynamic import), which
 * vi.mock cannot intercept — tests inject a mock parser here instead.
 */
export async function extractPdfText(url: string, parse?: PdfParseFn): Promise<string | null> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'DemocracyMonitor/1.0 (civic monitoring)',
        Accept: 'application/pdf',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });

    if (!response.ok) return null;

    const contentLength = response.headers.get('content-length');
    if (contentLength && parseInt(contentLength, 10) > DOWNLOAD_BYTE_LIMIT) {
      console.warn(`[pdf-extractor] Skipping oversized PDF (${contentLength} bytes): ${url}`);
      return null;
    }

    const buffer = await readBodyWithLimit(response, DOWNLOAD_BYTE_LIMIT);
    if (!buffer) return null;

    // eslint-disable-next-line -- lazy require to avoid pdf-parse eager test PDF load
    const pdfParse: PdfParseFn = parse ?? require('pdf-parse');
    const { text } = await pdfParse(buffer, { max: MAX_PAGES_PARSED });
    const cleaned = text.replace(/\0/g, '').replace(/\s+/g, ' ').trim();
    if (!cleaned || cleaned.length < 20) return null;

    return cleaned.length > MAX_CONTENT_LENGTH
      ? cleaned.slice(0, MAX_CONTENT_LENGTH) + '…'
      : cleaned;
  } catch (err) {
    const msg = formatError(err);
    if (!msg.includes('aborted') && !msg.includes('timeout')) {
      console.warn(`[pdf-extractor] Failed for ${url}: ${msg}`);
    }
    return null;
  }
}
