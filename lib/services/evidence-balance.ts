import type { StatusLevel } from '@/lib/types';

export interface EvidenceItem {
  text: string;
  direction: 'concerning' | 'reassuring';
  source?: string;
}

const CONCERNING_INDICATORS = [
  'violated', 'illegal', 'unlawful', 'defied', 'refused', 'contempt',
  'fired', 'removed', 'terminated', 'blocked', 'obstructed', 'suppressed',
  'override', 'bypass', 'circumvent', 'undermine', 'erode', 'weaken',
  'unprecedented', 'systematic', 'pattern of', 'mass',
];

const REASSURING_INDICATORS = [
  'upheld', 'protected', 'restored', 'compliance', 'cooperat',
  'bipartisan', 'transparency', 'accountability', 'oversight',
  'independent', 'safeguard', 'reform', 'strengthen',
  'court ordered', 'injunction granted', 'investigation opened',
];

export function categorizeEvidence(
  items: any[],
  status: StatusLevel
): { evidenceFor: EvidenceItem[]; evidenceAgainst: EvidenceItem[] } {
  const evidenceFor: EvidenceItem[] = [];
  const evidenceAgainst: EvidenceItem[] = [];

  for (const item of items) {
    if (item.isError || item.isWarning) continue;

    const text = `${item.title || ''} ${item.summary || ''}`.toLowerCase();
    const title = item.title || '(untitled)';

    const concerningScore = CONCERNING_INDICATORS.filter(w => text.includes(w)).length;
    const reassuringScore = REASSURING_INDICATORS.filter(w => text.includes(w)).length;

    if (concerningScore > reassuringScore && concerningScore > 0) {
      evidenceFor.push({
        text: title,
        direction: 'concerning',
        source: item.agency,
      });
    } else if (reassuringScore > 0) {
      evidenceAgainst.push({
        text: title,
        direction: 'reassuring',
        source: item.agency,
      });
    }
  }

  // For Stable status, flip the perspective: reassuring items support the assessment
  if (status === 'Stable') {
    return {
      evidenceFor: evidenceAgainst.slice(0, 5),
      evidenceAgainst: evidenceFor.slice(0, 5),
    };
  }

  return {
    evidenceFor: evidenceFor.slice(0, 5),
    evidenceAgainst: evidenceAgainst.slice(0, 5),
  };
}
