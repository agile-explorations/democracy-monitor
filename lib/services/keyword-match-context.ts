import { ASSESSMENT_RULES } from '@/lib/data/assessment-rules';
import type { ContentItem, KeywordMatchContext, StatusLevel } from '@/lib/types';

/** Strip annotations like "(authoritative source)" or "(systematic pattern)" from a keyword match. */
export function stripAnnotation(match: string): string {
  return match
    .replace(/\s*\(.*\)\s*$/, '')
    .trim()
    .toLowerCase();
}

export function buildKeywordMatchContexts(
  matches: string[],
  category: string,
  items: ContentItem[],
): KeywordMatchContext[] {
  return matches.map((match) => ({
    keyword: match,
    tier: classifyMatchTier(match, category),
    matchedIn: findMatchSource(match, items),
  }));
}

export function classifyMatchTier(
  match: string,
  category: string,
): 'capture' | 'drift' | 'warning' {
  const rules = ASSESSMENT_RULES[category];
  if (!rules?.keywords) return 'warning';

  const cleanMatch = stripAnnotation(match);

  if (rules.keywords.capture.some((k) => cleanMatch === k.toLowerCase())) return 'capture';
  if (rules.keywords.drift.some((k) => cleanMatch === k.toLowerCase())) return 'drift';
  if (rules.keywords.warning.some((k) => cleanMatch === k.toLowerCase())) return 'warning';

  if (match.includes('(systematic pattern)')) return 'capture';
  if (match.includes('(authoritative source)')) return 'capture';

  return 'warning';
}

export function findMatchSource(match: string, items: ContentItem[]): string {
  const cleanMatch = stripAnnotation(match);

  for (const item of items) {
    const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
    if (text.includes(cleanMatch)) {
      return item.title || '(untitled)';
    }
  }

  return '(source not identified)';
}

export function generateKeywordCounterEvidence(status: StatusLevel, _category: string): string[] {
  switch (status) {
    case 'Capture':
      return [
        'Keyword matching may trigger on document titles that discuss violations without indicating current violations',
        'Court-related keywords may reflect ongoing litigation rather than actual defiance',
        'High-authority source matches may be from historical or analytical reports rather than new findings',
      ];
    case 'Drift':
      return [
        'Multiple keyword matches may reflect increased reporting rather than increased violations',
        'Regulatory activity patterns may be within normal variation for this time period',
      ];
    case 'Warning':
      return [
        'Warning-level keywords often appear in routine government documents',
        'A single drift keyword match may be coincidental rather than indicative of a pattern',
      ];
    case 'Stable':
      return [
        'Absence of keyword matches does not guarantee absence of concerning activity',
        'Some forms of power consolidation may not generate detectable keywords',
      ];
  }
}
