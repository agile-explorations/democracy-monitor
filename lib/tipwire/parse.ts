/**
 * R-TIPWIRE pure parsing helpers (#854): feed items, listing links, page
 * metas, JSON-LD, bylines, dates. No I/O — every function here is exercised
 * on fixtures in __tests__/lib/tipwire/acquire.test.ts.
 */

import { createHash } from 'node:crypto';
import { parseStringPromise } from 'xml2js';
import { stripHtml } from '@/lib/parsers/feed-parser';

/** An article is "reactive" (send-today) when published within this window. */
export const REACTIVE_WINDOW_MS = 24 * 60 * 60 * 1000;
const MAX_LEDE_CHARS = 600;

export type LedeSource = 'jsonld' | 'og' | 'rss' | 'none';

export interface RssItemLite {
  title: string;
  link: string | null;
  pubDate: string | null;
  summary: string | null;
  creators: string[];
}

function textOf(v: unknown): string | null {
  if (typeof v === 'string') return v.trim() || null;
  if (v && typeof v === 'object' && '_' in v) return textOf((v as { _: unknown })._);
  return null;
}

function listOf(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(textOf).filter((s): s is string => Boolean(s));
  const one = textOf(v);
  return one ? [one] : [];
}

/** Normalize xml2js items (explicitArray:false, mergeAttrs:true) to a lite shape. */
export function normalizeRssItems(items: unknown[]): RssItemLite[] {
  return items.map((raw) => {
    const item = (raw ?? {}) as Record<string, unknown>;
    const link =
      textOf(item.link) ??
      (typeof item.link === 'object' && item.link
        ? textOf((item.link as { href?: unknown }).href)
        : null) ??
      textOf(item.guid);
    const rawSummary =
      textOf(item['content:encoded']) ?? textOf(item.description) ?? textOf(item.summary);
    return {
      title: textOf(item.title) ?? '(untitled)',
      link,
      pubDate: textOf(item.pubDate) ?? textOf(item.published) ?? textOf(item.updated),
      summary: rawSummary ? stripHtml(rawSummary).slice(0, MAX_LEDE_CHARS) : null,
      creators: listOf(item['dc:creator']).concat(listOf(item.author)),
    };
  });
}

export async function parseRssText(xml: string): Promise<RssItemLite[]> {
  const parsed = await parseStringPromise(xml, { explicitArray: false, mergeAttrs: true });
  const items = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
  return normalizeRssItems(Array.isArray(items) ? items : items ? [items] : []);
}

/** Canonical key for a publisher URL: no query, no hash, no trailing slash. */
export function articleKey(url: string): string {
  try {
    const u = new URL(url);
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return url.trim();
  }
}

export function dedupeByKey(items: RssItemLite[]): RssItemLite[] {
  const seen = new Set<string>();
  return items.filter((it) => {
    if (!it.link) return false;
    const k = articleKey(it.link);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const HREF_RE = /href=["']([^"']+)["']/gi;

/** Absolute article links on a listing page, in page order, unique. */
export function extractArticleLinks(html: string, baseUrl: string, pattern: RegExp): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const m of html.matchAll(HREF_RE)) {
    let href: string;
    try {
      href = new URL(m[1], baseUrl).toString();
    } catch {
      continue;
    }
    const key = articleKey(href);
    if (!pattern.test(key) || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

const META_RE = /<meta\s+[^>]*>/gi;

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

/** All `content` values of <meta name|property="…"> tags with the given name. */
export function extractMetaValues(html: string, name: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(META_RE)) {
    const tag = m[0];
    const key = /(?:name|property)=["']([^"']+)["']/i.exec(tag)?.[1];
    if (!key || key.toLowerCase() !== name.toLowerCase()) continue;
    const content = /content=["']([^"']*)["']/i.exec(tag)?.[1];
    if (content) out.push(decodeEntities(content));
  }
  return out;
}

const JSONLD_RE = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

function jsonLdObjects(html: string): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  for (const m of html.matchAll(JSONLD_RE)) {
    try {
      const parsed = JSON.parse(m[1]) as unknown;
      for (const o of Array.isArray(parsed) ? parsed : [parsed]) {
        if (!o || typeof o !== 'object') continue;
        out.push(o as Record<string, unknown>);
        const graph = (o as { '@graph'?: unknown })['@graph'];
        if (Array.isArray(graph))
          for (const g of graph) if (g && typeof g === 'object') out.push(g);
      }
    } catch {
      /* malformed block — ignore */
    }
  }
  return out;
}

function isArticleLd(o: Record<string, unknown>): boolean {
  const t = o['@type'];
  return (Array.isArray(t) ? t : [t]).some((x) => typeof x === 'string' && /Article/i.test(x));
}

/** Lede precedence: JSON-LD Article description → og:description → none. */
export function extractLede(html: string): { lede: string | null; source: LedeSource } {
  for (const o of jsonLdObjects(html)) {
    if (isArticleLd(o) && typeof o.description === 'string' && o.description.trim()) {
      return { lede: stripHtml(o.description).slice(0, MAX_LEDE_CHARS), source: 'jsonld' };
    }
  }
  const og = extractMetaValues(html, 'og:description')[0];
  if (og?.trim()) return { lede: stripHtml(og).slice(0, MAX_LEDE_CHARS), source: 'og' };
  return { lede: null, source: 'none' };
}

export function toIso(dateText: string): string | null {
  const d = new Date(dateText);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Published date: JSON-LD datePublished → article:published_time → citation_date. */
export function extractPublishedAt(html: string): string | null {
  for (const o of jsonLdObjects(html)) {
    if (isArticleLd(o) && typeof o.datePublished === 'string') return toIso(o.datePublished);
  }
  const meta =
    extractMetaValues(html, 'article:published_time')[0] ??
    extractMetaValues(html, 'citation_date')[0] ??
    null;
  return meta ? toIso(meta) : null;
}

export interface SitemapEntry {
  loc: string;
  lastmod: string | null;
}

const SITEMAP_URL_RE = /<url>\s*<loc>([^<]+)<\/loc>(?:\s*<lastmod>([^<]+)<\/lastmod>)?/gi;

/** `<url><loc>…</loc><lastmod>…</lastmod></url>` entries, canonical keys. */
export function extractSitemapEntries(xml: string): SitemapEntry[] {
  const out: SitemapEntry[] = [];
  for (const m of xml.matchAll(SITEMAP_URL_RE)) {
    out.push({ loc: articleKey(m[1].trim()), lastmod: m[2] ? toIso(m[2].trim()) : null });
  }
  return out;
}

/** `{YYYYMM}` for `now` and the previous `months - 1` months. */
export function sitemapUrlsFor(template: string, months: number, now: Date): string[] {
  const urls: string[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const yyyymm = `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    urls.push(template.replace('{YYYYMM}', yyyymm));
  }
  return urls;
}

/** Page title: og:title → <title> → fallback. */
export function extractTitle(html: string, fallback: string): string {
  const og = extractMetaValues(html, 'og:title')[0];
  if (og?.trim()) return og.trim();
  const t = /<title>([^<]*)/i.exec(html)?.[1];
  return t?.trim() ? stripHtml(t) : fallback;
}

function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/^by\s+/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function nameSlug(name: string): string {
  return normalizeName(name).replace(/\s+/g, '-');
}

/**
 * Does any byline value name this reporter? Values may be "Erich Wagner",
 * "by Mica Rosenberg", "A, B and C", or an author URL ending in the slug
 * (NOTUS `article:author`). Returns the number of distinct people credited so
 * the digest can show co-authored pieces.
 */
export function matchesAuthor(
  values: string[],
  reporterName: string,
): { match: boolean; coauthorCount: number } {
  const target = normalizeName(reporterName);
  const slug = nameSlug(reporterName);
  const people = new Set<string>();
  let match = false;
  for (const v of values) {
    if (/^https?:\/\//i.test(v)) {
      const last = (v.replace(/\/+$/, '').split('/').pop() ?? '').toLowerCase();
      people.add(last);
      if (last === slug) match = true;
      continue;
    }
    for (const part of v.split(/,|&|\band\b/i)) {
      const n = normalizeName(part);
      if (!n) continue;
      people.add(n);
      if (n === target || n.includes(target)) match = true;
    }
  }
  return { match, coauthorCount: Math.max(0, people.size - 1) };
}

export function isReactive(publishedAt: string | null, now: Date): boolean {
  if (!publishedAt) return false;
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) return false;
  const age = now.getTime() - t;
  return age >= -60 * 60 * 1000 && age <= REACTIVE_WINDOW_MS;
}

export function sha1(s: string): string {
  return createHash('sha1').update(s).digest('hex');
}
