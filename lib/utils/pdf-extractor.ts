import { formatError } from '@/lib/utils/api-helpers';

// pdf-parse v1 eagerly loads a test PDF at import time, breaking vitest.
// Lazy-require avoids this — the module is only loaded when actually called.
type PdfParseResult = { text: string };
type PdfParseFn = (buffer: Buffer) => Promise<PdfParseResult>;

const FETCH_TIMEOUT_MS = 60_000;
const MAX_PDF_BYTES = 20 * 1024 * 1024; // 20 MB
const MAX_CONTENT_LENGTH = 8_000;

/**
 * Download a PDF from a URL and extract its text content.
 * Returns null for corrupt, password-protected, oversized, or unreachable PDFs.
 * Text is truncated to MAX_CONTENT_LENGTH characters.
 */
export async function extractPdfText(url: string): Promise<string | null> {
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
    if (contentLength && parseInt(contentLength, 10) > MAX_PDF_BYTES) {
      console.warn(`[pdf-extractor] Skipping oversized PDF (${contentLength} bytes): ${url}`);
      return null;
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_PDF_BYTES) {
      console.warn(`[pdf-extractor] Skipping oversized PDF (${buffer.length} bytes): ${url}`);
      return null;
    }

    // eslint-disable-next-line -- lazy require to avoid pdf-parse eager test PDF load
    const pdfParse: PdfParseFn = require('pdf-parse');
    const { text } = await pdfParse(buffer);
    const cleaned = text.replace(/\0/g, '').replace(/\s+/g, ' ').trim();
    if (!cleaned || cleaned.length < 20) return null;

    return cleaned.length > MAX_CONTENT_LENGTH
      ? cleaned.slice(0, MAX_CONTENT_LENGTH) + '\u2026'
      : cleaned;
  } catch (err) {
    const msg = formatError(err);
    if (!msg.includes('aborted') && !msg.includes('timeout')) {
      console.warn(`[pdf-extractor] Failed for ${url}: ${msg}`);
    }
    return null;
  }
}
