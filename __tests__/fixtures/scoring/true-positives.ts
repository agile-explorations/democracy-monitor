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
      pubDate: '2025-06-01',
    },
    category: 'executiveOversight',
    expectedKeyword: 'mass ig removal',
    expectedTier: 'capture',
  },
  {
    name: 'Defiance of court order',
    item: {
      title: 'Administration Defies Court Order on Deportations',
      summary:
        'Despite a federal injunction, the administration defied court order and continued deportation flights, prompting calls for contempt proceedings.',
      pubDate: '2025-06-01',
    },
    category: 'judicialIndependence',
    expectedKeyword: 'defied court order',
    expectedTier: 'capture',
  },
  {
    name: 'Mass termination of career staff',
    item: {
      title: 'President Orders Mass Termination of Career Federal Workers',
      summary:
        'The administration ordered mass termination of thousands of career civil servants across multiple agencies.',
      pubDate: '2025-06-01',
    },
    category: 'civilService',
    expectedKeyword: 'mass termination',
    expectedTier: 'capture',
  },
  {
    name: 'Illegal impoundment finding',
    item: {
      title: 'GAO: Administration Violated Impoundment Control Act',
      summary:
        'The Government Accountability Office issued a formal decision finding that the administration violated impoundment control act by withholding congressionally appropriated funds.',
      agency: 'Government Accountability Office',
      pubDate: '2025-06-01',
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
      pubDate: '2025-06-01',
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
      pubDate: '2025-06-01',
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
      pubDate: '2025-06-01',
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
      pubDate: '2025-06-01',
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
      pubDate: '2025-06-01',
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
      pubDate: '2025-06-01',
    },
    category: 'executiveActions',
    expectedKeyword: 'democracy downgrade',
    expectedTier: 'capture',
  },
  {
    name: 'Selective prosecution by DOJ',
    item: {
      title: 'DOJ Accused of Selective Prosecution Against Political Opponents',
      summary:
        'Critics allege a pattern of selective prosecution targeting opposition figures while declining to pursue similar cases against allies.',
      pubDate: '2025-06-01',
    },
    category: 'lawEnforcement',
    expectedKeyword: 'selective prosecution',
    expectedTier: 'capture',
  },
  {
    name: 'DOJ leadership overrules career prosecutors',
    item: {
      title: 'Senior DOJ Officials Override Career Prosecutors on Sentencing',
      summary:
        'In a rare move, doj leadership overruled career staff on the recommended sentence, prompting resignations from the trial team.',
      pubDate: '2025-06-01',
    },
    category: 'lawEnforcement',
    expectedKeyword: 'doj leadership overruled career staff',
    expectedTier: 'drift',
  },
  {
    name: 'Mass detention without charge',
    item: {
      title: 'Reports of Mass Detention Without Charge at Border Facilities',
      summary:
        'Advocacy groups documented mass detention without charge of hundreds of individuals held beyond statutory time limits.',
      pubDate: '2025-06-01',
    },
    category: 'civilLiberties',
    expectedKeyword: 'mass detention without charge',
    expectedTier: 'capture',
  },
  {
    name: 'Consent decree terminated',
    item: {
      title: 'DOJ Moves to Terminate Police Reform Consent Decrees',
      summary:
        'The Department of Justice filed motions to end oversight of several police departments, seeking to have each consent decree terminated early.',
      pubDate: '2025-06-01',
    },
    category: 'civilLiberties',
    expectedKeyword: 'consent decree terminated',
    expectedTier: 'drift',
  },
  {
    name: 'Mass deportation operation',
    item: {
      title: 'Administration Launches Largest Mass Deportation Operation in Decades',
      summary:
        'Federal authorities initiated a mass deportation campaign targeting multiple cities with coordinated raids and removal flights.',
      pubDate: '2025-06-01',
    },
    category: 'immigrationEnforcement',
    expectedKeyword: 'mass deportation',
    expectedTier: 'capture',
  },
  {
    name: 'Asylum restrictions tightened',
    item: {
      title: 'New Rule Dramatically Limits Asylum Eligibility',
      summary:
        'The administration issued a final rule under which asylum restrictions tightened to bar most claims from individuals who transited through third countries.',
      pubDate: '2025-06-01',
    },
    category: 'immigrationEnforcement',
    expectedKeyword: 'asylum restrictions tightened',
    expectedTier: 'drift',
  },
];
