import type { ContentItem } from '@/lib/types';
import type { DocumentClass } from '@/lib/types/scoring';

/** Federal Register document type -> DocumentClass mapping. */
const FR_TYPE_MAP: Record<string, DocumentClass> = {
  Rule: 'final_rule',
  'Proposed Rule': 'proposed_rule',
  Notice: 'notice',
};

/** FR Presidential Document subtype -> DocumentClass mapping. */
const PRESIDENTIAL_SUBTYPE_MAP: Record<string, DocumentClass> = {
  'Executive Order': 'executive_order',
  'Presidential Memorandum': 'presidential_memorandum',
  Proclamation: 'proclamation',
  'Presidential Notice': 'presidential_notice',
};

/** Source-based classification heuristics (matched against agency or URL). */
const SOURCE_CLASS_PATTERNS: Array<{ pattern: string; cls: DocumentClass }> = [
  { pattern: 'supreme court', cls: 'court_opinion' },
  { pattern: 'scotus', cls: 'court_opinion' },
  { pattern: 'gao', cls: 'report' },
  { pattern: 'government accountability', cls: 'report' },
  { pattern: 'inspector general', cls: 'report' },
  { pattern: 'cbo', cls: 'report' },
  { pattern: 'congressional research', cls: 'report' },
  { pattern: 'department of defense', cls: 'press_release' },
  { pattern: 'dod', cls: 'press_release' },
  { pattern: 'white house', cls: 'press_release' },
];

export function classifyDocument(item: ContentItem): DocumentClass {
  // Presidential Documents: use subtype for precise classification
  if (item.type === 'Presidential Document') {
    if (item.subtype && PRESIDENTIAL_SUBTYPE_MAP[item.subtype]) {
      return PRESIDENTIAL_SUBTYPE_MAP[item.subtype];
    }
    return 'executive_order'; // fallback for unknown presidential subtypes
  }

  if (item.type && FR_TYPE_MAP[item.type]) {
    return FR_TYPE_MAP[item.type];
  }

  const title = (item.title || '').toLowerCase();
  if (title.includes('executive order')) return 'executive_order';
  if (title.includes('presidential memorandum')) return 'presidential_memorandum';
  if (title.includes('proclamation')) return 'proclamation';

  const agency = (item.agency || '').toLowerCase();
  const link = (item.link || '').toLowerCase();
  for (const { pattern, cls } of SOURCE_CLASS_PATTERNS) {
    if (agency.includes(pattern) || link.includes(pattern)) {
      return cls;
    }
  }

  return 'unknown';
}
