import type { ContentItem } from '@/lib/types';

/**
 * Test cases for known true-positive scenarios.
 * Each entry SHOULD be detected by the scoring engine with a non-zero score.
 */
export interface TruePositiveCase {
  name: string;
  item: ContentItem;
  category: string;
  /** The keyword that should be matched. */
  expectedKeyword: string;
  /** The expected severity tier of the match. */
  expectedTier: 'capture' | 'drift' | 'warning';
}

export const TRUE_POSITIVE_CASES: TruePositiveCase[] = [
  {
    name: 'Mass IG removal',
    item: {
      title: 'President Removes Five Inspectors General in Late Friday Announcement',
      summary:
        'The administration fired five inspectors general across major departments, marking the largest mass ig removal in modern history.',
    },
    category: 'igs',
    expectedKeyword: 'mass ig removal',
    expectedTier: 'capture',
  },
  {
    name: 'Defiance of court order',
    item: {
      title: 'Administration Defies Court Order on Deportations',
      summary:
        'Despite a federal injunction, the administration defied court order and continued deportation flights, prompting calls for contempt proceedings.',
    },
    category: 'courts',
    expectedKeyword: 'defied court order',
    expectedTier: 'capture',
  },
  {
    name: 'Schedule F executive order',
    item: {
      title: 'Schedule F Executive Order Signed, Reclassifying Thousands of Federal Workers',
      summary:
        'The President signed an executive order reinstating Schedule F, which would convert career civil servants to at-will employees.',
    },
    category: 'civilService',
    expectedKeyword: 'schedule f',
    expectedTier: 'capture',
  },
  {
    name: 'Illegal impoundment finding',
    item: {
      title: 'GAO: Administration Violated Impoundment Control Act',
      summary:
        'The Government Accountability Office issued a formal decision finding that the administration violated impoundment control act by withholding congressionally appropriated funds.',
      agency: 'Government Accountability Office',
    },
    category: 'fiscal',
    expectedKeyword: 'violated impoundment control act',
    expectedTier: 'capture',
  },
  {
    name: 'Insurrection Act preparation',
    item: {
      title: 'Reports: White House Drafting Insurrection Act Invocation',
      summary:
        'Multiple sources confirm the administration is preparing to invoke the insurrection act invoked in response to ongoing protests.',
    },
    category: 'military',
    expectedKeyword: 'insurrection act invoked',
    expectedTier: 'capture',
  },
  {
    name: 'Press credentials revoked',
    item: {
      title: 'White House Revokes Press Credentials for Multiple Outlets',
      summary:
        'Several news organizations had their press credentials revoked after publishing critical coverage of the administration.',
    },
    category: 'mediaFreedom',
    expectedKeyword: 'press credentials revoked',
    expectedTier: 'drift',
  },
  {
    name: 'Voter roll purge (not routine)',
    item: {
      title: 'State Orders Massive Voter Roll Purge Weeks Before Election',
      summary:
        'The Secretary of State ordered a voter roll purge targeting hundreds of thousands of registrations just weeks before the general election.',
    },
    category: 'elections',
    expectedKeyword: 'voter roll purge',
    expectedTier: 'drift',
  },
  {
    name: 'Regulatory freeze',
    item: {
      title: 'Administration Orders Regulatory Freeze Across All Agencies',
      summary:
        'A sweeping regulatory freeze directive was issued requiring all agencies to halt pending rulemakings.',
    },
    category: 'rulemaking',
    expectedKeyword: 'regulatory freeze',
    expectedTier: 'drift',
  },
  {
    name: 'Website removed (data deletion)',
    item: {
      title: 'Climate Data Portal Taken Offline Without Notice',
      summary:
        'The EPA website removed its public climate data portal, with no notice provided. Data previously accessible has been purged.',
    },
    category: 'infoAvailability',
    expectedKeyword: 'website removed',
    expectedTier: 'capture',
  },
  {
    name: 'Democracy downgrade by international index',
    item: {
      title: 'Freedom House Issues Democracy Downgrade for United States',
      summary:
        'Freedom House downgraded the US in its annual report, citing erosion of judicial independence and press freedom as factors in the democracy downgrade.',
    },
    category: 'indices',
    expectedKeyword: 'democracy downgrade',
    expectedTier: 'capture',
  },
];
