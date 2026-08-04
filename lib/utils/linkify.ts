/**
 * Autolink helper (#675). Splits plain text into text/link segments so the
 * renderer can build React `<a>` elements — never injected HTML. Only
 * `http(s)://` URLs are recognized; `javascript:`, `data:`, and bare `www.`
 * stay plain text (scheme allowlist by construction), so no unsafe scheme can
 * become a link.
 */

export interface LinkSegment {
  type: 'text' | 'link';
  value: string;
}

/** Matches http/https URLs run up to the next whitespace. */
const URL_PATTERN = /https?:\/\/\S+/gi;

/** Trailing characters trimmed off a matched URL (sentence punctuation, closers). */
const TRAILING_PUNCTUATION = /[.,!?:;'")\]}]+$/;

/**
 * Split `text` into ordered text/link segments. A matched URL has trailing
 * sentence punctuation moved back into the following text segment, so
 * "see https://x.com." links only `https://x.com` and keeps the period as text.
 * A balanced closing paren directly after an opening one in the URL is kept.
 */
export function splitLinkified(text: string): LinkSegment[] {
  const segments: LinkSegment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(URL_PATTERN)) {
    const matchStart = match.index;
    let url = match[0];

    // Peel trailing punctuation back out of the link (keeps it as text).
    const trailing = url.match(TRAILING_PUNCTUATION);
    let tail = '';
    if (trailing) {
      tail = trailing[0];
      url = url.slice(0, url.length - tail.length);
    }

    // A URL reduced to nothing (shouldn't happen for http(s)://) — skip.
    if (url.length === 0) continue;

    if (matchStart > lastIndex) {
      segments.push({ type: 'text', value: text.slice(lastIndex, matchStart) });
    }
    segments.push({ type: 'link', value: url });
    lastIndex = matchStart + url.length;
    if (tail) {
      segments.push({ type: 'text', value: tail });
      lastIndex += tail.length;
    }
  }

  if (lastIndex < text.length) {
    segments.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return segments;
}
