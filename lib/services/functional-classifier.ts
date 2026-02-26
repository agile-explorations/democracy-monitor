import type { FunctionalBucket } from '@/lib/types/structural';

/**
 * Title prefix heuristics for functional classification (Tier 2).
 * Checked in order — first match wins.
 */
const TITLE_HEURISTICS: Array<{ patterns: string[]; bucket: FunctionalBucket }> = [
  {
    patterns: ['excepted service', 'senior executive service', 'personnel demonstration'],
    bucket: 'personnel_action',
  },
  {
    patterns: [
      'privacy act',
      'agency information collection',
      'submission for omb',
      'information collection',
    ],
    bucket: 'administrative_procedure',
  },
  {
    patterns: ['self-regulatory organizations'],
    bucket: 'financial_regulatory',
  },
  {
    patterns: ['statement of organization, functions'],
    bucket: 'organizational_change',
  },
  {
    patterns: ['notice of determinations; culturally'],
    bucket: 'cultural_ceremonial',
  },
];

/**
 * Action field heuristics for functional classification (Tier 3).
 * Mapped from common FR `action` field values.
 */
const ACTION_HEURISTICS: Array<{ patterns: string[]; bucket: FunctionalBucket }> = [
  {
    patterns: ['notice of proposed rulemaking', 'advance notice of proposed rulemaking'],
    bucket: 'rulemaking',
  },
  {
    patterns: [
      'notice of meeting',
      'notice of hearing',
      'notice of public meeting',
      'notice of availability',
    ],
    bucket: 'administrative_procedure',
  },
  {
    patterns: ['reorganization', 'restructuring', 'reorganizing'],
    bucket: 'organizational_change',
  },
  {
    patterns: ['appointment', 'personnel action', 'delegation of authority'],
    bucket: 'personnel_action',
  },
];

interface ClassifiableDocument {
  title?: string;
  sourceType?: string;
  type?: string;
  action?: string;
}

/**
 * Classify a document into an institutional function bucket.
 *
 * Tiered approach:
 *   Tier 1 — source_type/type (~63%): Rule/Proposed Rule → rulemaking, Presidential → executive_action, rhetoric → news_rhetoric
 *   Tier 2 — title heuristics (~17%): keyword patterns in title
 *   Tier 3 — action field (~20%): FR action field values
 *   Tier 4 — unclassified remainder
 */
export function classifyDocumentFunction(doc: ClassifiableDocument): FunctionalBucket {
  const tier1 = classifyByType(doc);
  if (tier1) return tier1;

  const title = (doc.title ?? '').toLowerCase();

  const tier2 = classifyByHeuristics(title, TITLE_HEURISTICS);
  if (tier2) return tier2;

  const action = (doc.action ?? '').toLowerCase();
  if (action) {
    const tier3 = classifyByHeuristics(action, ACTION_HEURISTICS);
    if (tier3) return tier3;
  }

  return 'unclassified';
}

function classifyByType(doc: ClassifiableDocument): FunctionalBucket | null {
  const sourceType = (doc.sourceType ?? doc.type ?? '').toLowerCase();

  if (sourceType === 'rule' || sourceType === 'final_rule') return 'rulemaking';
  if (sourceType === 'proposed rule' || sourceType === 'proposed_rule') return 'rulemaking';
  if (sourceType === 'presidential document' || sourceType === 'presidential_memorandum')
    return 'executive_action';
  if (sourceType === 'executive_order' || sourceType === 'proclamation') return 'executive_action';
  if (sourceType === 'presidential_notice') return 'executive_action';
  if (sourceType === 'rhetoric') return 'news_rhetoric';
  if (sourceType === 'court_opinion' || sourceType === 'docket_entry') return 'judicial_action';
  if (sourceType === 'press_release') return 'enforcement_action';
  if (sourceType === 'gao_report' || sourceType === 'congressional_report') return 'administrative_procedure';
  if (sourceType === 'advisory_opinion') return 'administrative_procedure';
  if (sourceType === 'enforcement_action' || sourceType === 'admin_fine') return 'enforcement_action';

  return null;
}

function classifyByHeuristics(
  text: string,
  heuristics: Array<{ patterns: string[]; bucket: FunctionalBucket }>,
): FunctionalBucket | null {
  for (const { patterns, bucket } of heuristics) {
    for (const pattern of patterns) {
      if (text.includes(pattern)) return bucket;
    }
  }
  return null;
}

/**
 * Classify a batch of documents and return proportional distribution.
 * Values sum to 1.0 (or 0.0 if batch is empty).
 */
export function classifyBatch(docs: ClassifiableDocument[]): Record<FunctionalBucket, number> {
  const counts: Record<FunctionalBucket, number> = {
    rulemaking: 0,
    executive_action: 0,
    personnel_action: 0,
    administrative_procedure: 0,
    organizational_change: 0,
    financial_regulatory: 0,
    cultural_ceremonial: 0,
    news_rhetoric: 0,
    enforcement_action: 0,
    judicial_action: 0,
    unclassified: 0,
  };

  for (const doc of docs) {
    const bucket = classifyDocumentFunction(doc);
    counts[bucket]++;
  }

  const total = docs.length;
  if (total === 0) return counts;

  const distribution = { ...counts };
  for (const key of Object.keys(distribution) as FunctionalBucket[]) {
    distribution[key] = counts[key] / total;
  }

  return distribution;
}
