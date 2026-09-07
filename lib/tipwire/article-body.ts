/**
 * R-TIPWIRE contradiction mode (#863): the article body is read at judge time
 * only, bounded, and never persisted — news does not enter the corpus.
 */

import { stripHtml } from '@/lib/parsers/feed-parser';
import { fetchTextWithUa } from './acquire';
import type { FetchText } from './acquire';

/** Article body for the contradiction check: fetched at judge time, bounded,
 *  never stored (the no-news boundary). Best-effort: paragraph text from
 *  <article> when present, else all <p> text; null on any failure. */
export async function fetchArticleBody(
  url: string,
  maxChars: number,
  fetchText: FetchText = fetchTextWithUa,
): Promise<string | null> {
  try {
    const { status, text } = await fetchText(url);
    if (status !== 200 || !text) return null;
    const scope = /<article[\s\S]*?<\/article>/i.exec(text)?.[0] ?? text;
    const paragraphs = [...scope.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
      .map((m) => stripHtml(m[1]))
      .filter((p) => p.length > 40);
    const body = paragraphs.join(' ').trim();
    return body ? body.slice(0, maxChars) : null;
  } catch {
    return null;
  }
}
