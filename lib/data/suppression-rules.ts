/**
 * Suppression rules to reduce false positives in keyword-based assessment.
 *
 * When a keyword matches, the surrounding text is checked against these rules.
 * If a suppression term co-occurs, the match is suppressed (removed from scoring)
 * or downweighted (tier reduced by 1 level).
 */

export interface SuppressionRule {
  /** The keyword this rule applies to. */
  keyword: string;
  /** If any of these terms co-occur, suppress the match entirely. */
  suppress_if_any: string[];
  /** If any of these terms co-occur, downweight the tier by 1 level. */
  downweight_if_any?: string[];
}

/**
 * Per-category suppression rules for keywords most prone to false positives.
 */
export const SUPPRESSION_RULES: Record<string, SuppressionRule[]> = {
  courts: [
    {
      keyword: 'court packing',
      suppress_if_any: [
        'fdr',
        'roosevelt',
        '1937',
        'historical',
        'history of',
        'new deal',
        'lessons from',
      ],
    },
    {
      keyword: 'contempt of court',
      suppress_if_any: ['dismissed', 'overturned', 'acquitted', 'cleared'],
      downweight_if_any: ['civil contempt', 'procedural'],
    },
    {
      keyword: 'jurisdiction stripped',
      suppress_if_any: ['proposed', 'introduced', 'bill would', 'draft legislation'],
      downweight_if_any: ['committee debate', 'hearing on'],
    },
  ],
  igs: [
    {
      keyword: 'acting inspector general',
      suppress_if_any: ['appointed', 'confirmed', 'sworn in', 'senate confirmed'],
    },
    {
      keyword: 'ig vacancy',
      suppress_if_any: [
        'filled',
        'nomination confirmed',
        'new ig confirmed',
        'senate confirmed',
        'sworn in',
      ],
    },
    {
      keyword: 'ig fired',
      suppress_if_any: ['rumor denied', 'not confirmed', 'retracted'],
    },
  ],
  fiscal: [
    {
      keyword: 'impoundment',
      suppress_if_any: [
        'bipartisan',
        'passed',
        'signed into law',
        'continuing resolution',
        'impoundment control act history',
      ],
      downweight_if_any: ['proposed', 'under review'],
    },
    {
      keyword: 'rescission',
      suppress_if_any: ['approved by congress', 'bipartisan agreement', 'signed into law'],
    },
    {
      keyword: 'government shutdown',
      suppress_if_any: ['averted', 'prevented', 'bipartisan deal', 'continuing resolution passed'],
    },
    {
      keyword: 'funding freeze',
      suppress_if_any: ['lifted', 'reversed', 'court ordered release'],
    },
  ],
  military: [
    {
      keyword: 'troops deployed domestically',
      suppress_if_any: ['exercise', 'drill', 'training', 'disaster relief', 'hurricane response'],
    },
    {
      keyword: 'domestic military deployment',
      suppress_if_any: ['exercise', 'drill', 'training', 'disaster relief', 'hurricane response'],
    },
    {
      keyword: 'national guard activated',
      suppress_if_any: ['wildfire', 'hurricane', 'flood', 'disaster relief', 'snowstorm'],
      downweight_if_any: ['state request', 'governor requested'],
    },
    {
      keyword: 'federalized national guard',
      suppress_if_any: ['training exercise', 'annual training', 'routine deployment'],
    },
  ],
  elections: [
    {
      keyword: 'voter roll purge',
      suppress_if_any: [
        'routine maintenance',
        'deceased voters',
        'moved out of state',
        'nvra compliance',
      ],
    },
    {
      keyword: 'election audit',
      suppress_if_any: ['routine', 'post-election audit completed', 'bipartisan'],
      downweight_if_any: ['partisan audit', 'non-standard methodology'],
    },
  ],
  mediaFreedom: [
    {
      keyword: 'journalist subpoena',
      suppress_if_any: ['quashed', 'withdrawn', 'shield law applied'],
    },
  ],
};

/**
 * Global negation patterns that suppress any keyword match when found in context.
 * These indicate the text is reporting on the absence of the concerning behavior.
 */
export const NEGATION_PATTERNS: string[] = [
  'no evidence of',
  'no indication of',
  'rejected',
  'blocked',
  'struck down',
  'overturned',
  'ruled against',
  'denied request for',
  'failed to',
  'did not',
  'was not',
  'were not',
  'has not',
  'have not',
  'without evidence',
  'unfounded',
  'debunked',
  'false claim',
];
