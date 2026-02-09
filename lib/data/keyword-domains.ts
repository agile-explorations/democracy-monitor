/**
 * Metadata-only classification of keywords into governance domains.
 * Not used in scoring — available for future dual-axis analysis.
 *
 * Domains:
 * - legal: Keywords related to law, courts, statutes, compliance
 * - institutional: Keywords related to government agencies, positions, structures
 * - norms: Keywords related to democratic norms, precedent, behavior patterns
 *
 * Most keywords default to 'norms' — this map is populated incrementally.
 */

export type KeywordDomain = 'legal' | 'institutional' | 'norms';

export const KEYWORD_DOMAINS: Record<string, KeywordDomain> = {
  // Legal domain
  'contempt of court': 'legal',
  'defied court order': 'legal',
  'violated injunction': 'legal',
  'violated impoundment control act': 'legal',
  'illegal impoundment': 'legal',
  'anti-deficiency act violation': 'legal',
  'violated apa': 'legal',
  'unconstitutional rule': 'legal',
  'exceeded statutory authority': 'legal',
  'hatch act violation found': 'legal',
  'violated hatch act': 'legal',
  'insurrection act invoked': 'legal',
  'martial law declared': 'legal',
  'suspended habeas corpus': 'legal',
  'IEEPA invoked': 'legal',
  'posse comitatus': 'legal',
  'contempt citation': 'legal',
  'jurisdiction stripped': 'legal',

  // Institutional domain
  'schedule f': 'institutional',
  'inspector general removed': 'institutional',
  'ig fired': 'institutional',
  'mass ig removal': 'institutional',
  'eliminated ig office': 'institutional',
  'acting inspector general': 'institutional',
  'senior executive service': 'institutional',
  'career staff removed': 'institutional',
  'political appointee conversion': 'institutional',
  'independent agency overridden': 'institutional',
  'oira clearance expanded': 'institutional',
  'defunded inspector general': 'institutional',
  'defunded office of special counsel': 'institutional',
  'election official removed': 'institutional',
  'election board replaced': 'institutional',

  // Norms domain (explicitly marked subset; unlisted keywords default to 'norms')
  'court packing': 'norms',
  'democracy downgrade': 'norms',
  'authoritarian shift': 'norms',
  'erosion of norms': 'norms',
  'executive aggrandizement': 'norms',
  'systematic purge': 'norms',
  'political loyalty test': 'norms',
  'weaponized prosecution': 'norms',
  'enemy of the people': 'norms',
};

/** Look up the domain for a keyword, defaulting to 'norms'. */
export function getKeywordDomain(keyword: string): KeywordDomain {
  return KEYWORD_DOMAINS[keyword.toLowerCase()] ?? 'norms';
}
