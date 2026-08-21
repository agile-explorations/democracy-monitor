/**
 * GAO product-page parsing (#739) — the pure half of the GAO Wayback ingest
 * (I/O lives in gao-fetcher.ts). gao.gov WAF-blocks non-browser fetches, so
 * pages arrive as Wayback raw replays; the parser handles both page
 * generations (verified on live captures): the current template titles
 * "Title | U.S. GAO", the 2017-era template "U.S. GAO - Title" — the
 * Highlights sections (What GAO Found / Why GAO Did This Study / Fast
 * Facts) carry the same headings in both.
 */

import type { ContentItem } from '@/lib/types/assessment';

export const GAO_SOURCE_ORIGIN = 'gao';
/** Below this, Highlights extraction failed and the doc is metadata-only. */
export const GAO_MIN_BODY_CHARS = 400;

/** gao://products pseudo-URL (single signal; params reserved for future). */
export function parseGaoParams(signalUrl: string): { products: boolean } {
  return { products: signalUrl.startsWith('gao://products') };
}

export interface GaoProductRef {
  /** Lowercased product id, e.g. gao-26-108719 (suffixes kept: ...t, sp). */
  productId: string;
  /** Canonical live URL: https://www.gao.gov/products/<id>. */
  canonicalUrl: string;
}

/**
 * Canonicalize a gao.gov product URL (pure). Accepts only GAO-NN-NNNNN
 * report/testimony products; B-###### decisions and other families are out
 * of scope (#739 v1). Query strings (GovDelivery UTM tags are common in
 * captures) and http/https/host variants collapse to one canonical form.
 */
export function canonicalGaoProduct(url: string): GaoProductRef | null {
  const match = url.match(
    /^https?:\/\/(?:www\.)?gao\.gov\/products\/(gao-\d{2}-\d+[a-z]*)\/?(?:[?#]|$)/i,
  );
  if (!match) return null;
  const productId = match[1].toLowerCase();
  return { productId, canonicalUrl: `https://www.gao.gov/products/${productId}` };
}

export interface GaoParsedPage {
  title: string | null;
  /** ISO date (YYYY-MM-DD) from the page's Published field, if present. */
  releaseDate: string | null;
  fastFacts: string | null;
  whatGaoFound: string | null;
  whyStudy: string | null;
}

const MONTHS: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

function decodeEntities(text: string): string {
  return text
    .replace(/&rsquo;|&#8217;/g, '’')
    .replace(/&lsquo;|&#8216;/g, '‘')
    .replace(/&rdquo;|&#8221;/g, '”')
    .replace(/&ldquo;|&#8220;/g, '“')
    .replace(/&ndash;|&#8211;/g, '–')
    .replace(/&mdash;|&#8212;/g, '—')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'");
}

function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  )
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip site branding a title may carry in either generation's format. */
function stripGaoBranding(title: string): string {
  return title
    .replace(/\s*\|\s*U\.S\. GAO\s*$/i, '')
    .replace(/^U\.S\. GAO\s*[-–]\s*/i, '')
    .trim();
}

/** Title from og:title (both generations), stripped of site branding. */
function parseTitle(html: string): string | null {
  const og = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/i);
  if (og) return stripGaoBranding(decodeEntities(og[1]));
  const tag = html.match(/<title>([\s\S]*?)<\/title>/i);
  if (!tag) return null;
  return stripGaoBranding(decodeEntities(tag[1]));
}

/** First "Published: Mon DD, YYYY"-shaped date on the page → ISO. */
function parseReleaseDate(html: string): string | null {
  const match = html.match(
    /(?:Published|Release(?:d| Date))[:\s]*(?:<[^>]+>\s*)*([A-Z][a-z]{2,8})\.?\s+(\d{1,2}),\s+(\d{4})/,
  );
  if (!match) return null;
  const month = MONTHS[match[1].slice(0, 3).toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${month}-${match[2].padStart(2, '0')}`;
}

/**
 * Extract one Highlights section: text between a heading containing `label`
 * and the next heading of the same or higher level.
 */
function parseSection(html: string, label: string): string | null {
  const heading = new RegExp(`<h([1-4])[^>]*>\\s*${label}[\\s\\S]*?</h\\1>`, 'i');
  const start = html.match(heading);
  if (!start || start.index === undefined) return null;
  const afterHeading = html.slice(start.index + start[0].length);
  const nextHeading = afterHeading.match(/<h[1-4][^>]*>/i);
  const section = nextHeading ? afterHeading.slice(0, nextHeading.index) : afterHeading;
  const text = htmlToText(section);
  return text.length > 0 ? text : null;
}

/** Parse one GAO product page (either template generation). Pure. */
export function parseGaoProductPage(html: string): GaoParsedPage {
  return {
    title: parseTitle(html),
    releaseDate: parseReleaseDate(html),
    fastFacts: parseSection(html, 'Fast\\s+Facts'),
    whatGaoFound: parseSection(html, 'What\\s+GAO\\s+Found'),
    whyStudy: parseSection(html, 'Why\\s+GAO\\s+Did\\s+This\\s+Study'),
  };
}

/** Testimony products carry a T suffix on the id (GAO-26-108123T). */
export function gaoProductType(productId: string): 'report' | 'testimony' {
  return /\dt$/.test(productId) ? 'testimony' : 'report';
}

/** Assemble the storable body: labeled Highlights sections in reading order. */
export function buildGaoBody(parsed: GaoParsedPage): string {
  const sections: string[] = [];
  if (parsed.fastFacts) sections.push(`Fast Facts: ${parsed.fastFacts}`);
  if (parsed.whatGaoFound) sections.push(`What GAO Found: ${parsed.whatGaoFound}`);
  if (parsed.whyStudy) sections.push(`Why GAO Did This Study: ${parsed.whyStudy}`);
  return sections.join('\n\n');
}

/** Build the storable item for one GAO product (pure). */
export function toContentItem(opts: {
  ref: GaoProductRef;
  parsed: GaoParsedPage;
  /** Wayback capture used, e.g. https://web.archive.org/web/<ts>id_/<url>. */
  captureUrl: string;
  /** First-capture timestamp YYYYMMDDhhmmss — pubDate fallback. */
  firstCaptureTs: string;
}): ContentItem {
  const { ref, parsed, captureUrl, firstCaptureTs } = opts;
  const body = buildGaoBody(parsed);
  const fallbackDate = `${firstCaptureTs.slice(0, 4)}-${firstCaptureTs.slice(4, 6)}-${firstCaptureTs.slice(6, 8)}`;
  return {
    title: parsed.title ?? ref.productId.toUpperCase(),
    content: body,
    link: ref.canonicalUrl,
    pubDate: parsed.releaseDate ?? fallbackDate,
    type: 'gao_report',
    agency: 'Government Accountability Office',
    sourceOrigin: GAO_SOURCE_ORIGIN,
    contentType: body.length >= GAO_MIN_BODY_CHARS ? 'full_text' : 'metadata_only',
    metadata: {
      productId: ref.productId,
      productType: gaoProductType(ref.productId),
      retrievedVia: 'wayback',
      waybackCaptureUrl: captureUrl,
    },
  };
}
