import type { ContentItem } from '@/lib/types';
import type { DocumentClass } from '@/lib/types/scoring';

/** Federal Register document type -> DocumentClass mapping. */
const FR_TYPE_MAP: Record<string, DocumentClass> = {
  'Presidential Document': 'executive_order',
  Rule: 'final_rule',
  'Proposed Rule': 'proposed_rule',
  Notice: 'notice',
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
  if (item.type && FR_TYPE_MAP[item.type]) {
    return FR_TYPE_MAP[item.type];
  }

  const title = (item.title || '').toLowerCase();
  if (title.includes('executive order')) return 'executive_order';
  if (title.includes('presidential memorandum')) return 'presidential_memorandum';

  const agency = (item.agency || '').toLowerCase();
  const link = (item.link || '').toLowerCase();
  for (const { pattern, cls } of SOURCE_CLASS_PATTERNS) {
    if (agency.includes(pattern) || link.includes(pattern)) {
      return cls;
    }
  }

  return 'unknown';
}
