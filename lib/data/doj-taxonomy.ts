/**
 * Frozen mapping from DOJ topic/component fields to stable internal buckets.
 * DOJ can reorganize its labels at any time — we map to durable buckets
 * so reorganization doesn't appear as a structural anomaly.
 */

export type DojInternalBucket =
  | 'civil_rights_enforcement'
  | 'criminal_prosecution'
  | 'national_security'
  | 'antitrust'
  | 'environmental_enforcement'
  | 'consumer_protection'
  | 'immigration_enforcement'
  | 'public_corruption'
  | 'organized_crime'
  | 'cybercrime'
  | 'tax_enforcement'
  | 'civil_litigation'
  | 'office_of_attorney_general'
  | 'inspector_general'
  | 'other';

interface PatternMapping {
  patterns: string[];
  bucket: DojInternalBucket;
}

/** Topic-based classification (checked first). First match wins. */
export const DOJ_TOPIC_MAP: PatternMapping[] = [
  { patterns: ['civil rights'], bucket: 'civil_rights_enforcement' },
  { patterns: ['national security', 'terrorism', 'counterterrorism'], bucket: 'national_security' },
  { patterns: ['antitrust'], bucket: 'antitrust' },
  { patterns: ['environment', 'environmental'], bucket: 'environmental_enforcement' },
  { patterns: ['consumer protection', 'consumer fraud'], bucket: 'consumer_protection' },
  { patterns: ['immigration'], bucket: 'immigration_enforcement' },
  { patterns: ['public corruption', 'public integrity'], bucket: 'public_corruption' },
  { patterns: ['organized crime', 'racketeering'], bucket: 'organized_crime' },
  { patterns: ['cybercrime', 'cyber'], bucket: 'cybercrime' },
  { patterns: ['tax'], bucket: 'tax_enforcement' },
  { patterns: ['inspector general'], bucket: 'inspector_general' },
];

/** Component-based classification (checked when no topic matches). */
export const DOJ_COMPONENT_MAP: PatternMapping[] = [
  { patterns: ['civil rights division'], bucket: 'civil_rights_enforcement' },
  { patterns: ['criminal division'], bucket: 'criminal_prosecution' },
  { patterns: ['national security division'], bucket: 'national_security' },
  { patterns: ['antitrust division'], bucket: 'antitrust' },
  {
    patterns: ['environment and natural resources'],
    bucket: 'environmental_enforcement',
  },
  { patterns: ['civil division'], bucket: 'civil_litigation' },
  { patterns: ['tax division'], bucket: 'tax_enforcement' },
  { patterns: ['office of the attorney general'], bucket: 'office_of_attorney_general' },
  { patterns: ['office of the inspector general'], bucket: 'inspector_general' },
];

/**
 * Classify a DOJ press release into an internal bucket.
 * Checks topics first (more specific), then components, then defaults to 'other'.
 */
export function classifyDojRelease(topic?: string, component?: string): DojInternalBucket {
  const lowerTopic = (topic ?? '').toLowerCase();
  const lowerComponent = (component ?? '').toLowerCase();

  for (const { patterns, bucket } of DOJ_TOPIC_MAP) {
    for (const pattern of patterns) {
      if (lowerTopic.includes(pattern)) return bucket;
    }
  }

  for (const { patterns, bucket } of DOJ_COMPONENT_MAP) {
    for (const pattern of patterns) {
      if (lowerComponent.includes(pattern)) return bucket;
    }
  }

  return 'other';
}

/** Maps DOJ internal buckets to Democracy Monitor categories for secondary routing. */
export const DOJ_BUCKET_TO_CATEGORIES: Record<DojInternalBucket, string[]> = {
  civil_rights_enforcement: ['civilLiberties', 'lawEnforcement'],
  criminal_prosecution: ['lawEnforcement'],
  national_security: ['military', 'lawEnforcement'],
  antitrust: ['rulemaking'],
  environmental_enforcement: ['rulemaking'],
  consumer_protection: ['rulemaking'],
  immigration_enforcement: ['lawEnforcement', 'civilLiberties', 'immigrationEnforcement'],
  public_corruption: ['executiveOversight', 'lawEnforcement'],
  organized_crime: ['lawEnforcement'],
  cybercrime: ['lawEnforcement'],
  tax_enforcement: ['fiscal', 'lawEnforcement'],
  civil_litigation: ['judicialIndependence'],
  office_of_attorney_general: ['executiveOversight'],
  inspector_general: ['executiveOversight'],
  other: ['lawEnforcement'],
};
