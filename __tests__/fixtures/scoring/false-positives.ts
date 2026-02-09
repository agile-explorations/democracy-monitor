import type { ContentItem } from '@/lib/types';

/**
 * Test cases for known false-positive scenarios.
 * Each entry should be SUPPRESSED by the scoring engine.
 */
export interface FalsePositiveCase {
  name: string;
  item: ContentItem;
  category: string;
  /** The keyword that should be suppressed. */
  suppressedKeyword: string;
}

export const FALSE_POSITIVE_CASES: FalsePositiveCase[] = [
  {
    name: 'Historical court-packing reference (FDR)',
    item: {
      title: 'FDR and the 1937 Court-Packing Plan: Lessons for Today',
      summary:
        "A historical analysis of Roosevelt's failed attempt at court packing and its long-term consequences for judicial independence.",
    },
    category: 'courts',
    suppressedKeyword: 'court packing',
  },
  {
    name: 'RICO charge in drug trafficking context',
    item: {
      title: 'RICO Indictment in Drug Trafficking Case',
      summary:
        'Federal prosecutors filed RICO charges against members of an organized crime ring involved in drug trafficking and money laundering.',
    },
    category: 'courts',
    suppressedKeyword: 'court packing', // Not relevant to courts — the RICO suppression is for infrastructure
  },
  {
    name: 'Negation: no evidence of impoundment violation',
    item: {
      title: 'GAO Review Finds No Evidence of Impoundment Violation',
      summary:
        'The Government Accountability Office found no evidence of illegal impoundment in the latest quarterly review of executive spending.',
    },
    category: 'fiscal',
    suppressedKeyword: 'impoundment',
  },
  {
    name: 'FISA annual compliance review',
    item: {
      title: 'Annual FISA Compliance Review Released',
      summary:
        'The Office of the Director of National Intelligence published its annual report on FISA compliance, showing adherence to court-imposed minimization procedures.',
    },
    category: 'courts',
    suppressedKeyword: 'court packing', // FISA suppression is for infrastructure
  },
  {
    name: 'Bipartisan impoundment resolution',
    item: {
      title: 'Bipartisan Deal Averts Impoundment Crisis',
      summary:
        'Congressional leaders reached a bipartisan agreement to release frozen funds, avoiding a prolonged impoundment standoff.',
    },
    category: 'fiscal',
    suppressedKeyword: 'impoundment',
  },
  {
    name: 'Court contempt dismissed',
    item: {
      title: 'Contempt of Court Charge Dismissed in Federal Case',
      summary:
        'A federal judge dismissed the contempt of court citation after finding the defendant had substantially complied with the original order.',
    },
    category: 'courts',
    suppressedKeyword: 'contempt of court',
  },
  {
    name: 'Military training exercise, not domestic deployment',
    item: {
      title: 'Annual Military Training Exercise at Fort Liberty',
      summary:
        'The Department of Defense announced a routine training exercise involving domestic military deployment of reserve units for annual readiness drills.',
    },
    category: 'military',
    suppressedKeyword: 'domestic military deployment',
  },
  {
    name: 'IG vacancy filled (senate confirmation)',
    item: {
      title: 'Senate Confirms New Inspector General for Commerce Department',
      summary:
        'The Senate confirmed the nomination, ending a prolonged ig vacancy at the Department of Commerce. The new IG was sworn in today.',
    },
    category: 'igs',
    suppressedKeyword: 'ig vacancy',
  },
  {
    name: 'Negation: rejected impoundment attempt',
    item: {
      title: 'Court Blocked Impoundment of Education Funds',
      summary:
        "A federal court ruled against the administration's attempt to withhold education funding, rejecting the impoundment as unauthorized.",
    },
    category: 'fiscal',
    suppressedKeyword: 'impoundment',
  },
  {
    name: 'National Guard activated for hurricane',
    item: {
      title: 'National Guard Activated for Hurricane Relief',
      summary:
        'The governor activated the National Guard to assist with hurricane disaster relief operations across the affected coastal counties.',
    },
    category: 'military',
    suppressedKeyword: 'national guard activated',
  },
];
