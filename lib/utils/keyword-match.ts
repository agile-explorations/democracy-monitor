/**
 * Word-boundary-aware keyword matching.
 * Prevents substring false positives like "mass" matching "Massachusetts".
 */

// Cache compiled regexes for performance
const regexCache = new Map<string, RegExp>();

function getKeywordRegex(keyword: string): RegExp {
  let re = regexCache.get(keyword);
  if (!re) {
    const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    re = new RegExp(`\\b${escaped}\\b`, 'i');
    regexCache.set(keyword, re);
  }
  return re;
}

/** Returns true if `keyword` appears in `text` as a whole-word match (case-insensitive). */
export function matchKeyword(text: string, keyword: string): boolean {
  return getKeywordRegex(keyword).test(text);
}
