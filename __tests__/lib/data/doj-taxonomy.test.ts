import { describe, expect, it } from 'vitest';
import {
  classifyDojRelease,
  DOJ_BUCKET_TO_CATEGORIES,
  DOJ_COMPONENT_MAP,
  DOJ_TOPIC_MAP,
} from '@/lib/data/doj-taxonomy';
import type { DojInternalBucket } from '@/lib/data/doj-taxonomy';

describe('classifyDojRelease', () => {
  describe('topic-based classification', () => {
    it('maps civil rights topic to civil_rights_enforcement', () => {
      expect(classifyDojRelease('civil rights', undefined)).toBe('civil_rights_enforcement');
    });

    it('maps national security topic to national_security', () => {
      expect(classifyDojRelease('national security', undefined)).toBe('national_security');
    });

    it('maps antitrust topic to antitrust', () => {
      expect(classifyDojRelease('antitrust', undefined)).toBe('antitrust');
    });

    it('maps immigration topic to immigration_enforcement', () => {
      expect(classifyDojRelease('immigration', undefined)).toBe('immigration_enforcement');
    });

    it('maps cybercrime topic to cybercrime', () => {
      expect(classifyDojRelease('cybercrime investigation', undefined)).toBe('cybercrime');
    });
  });

  describe('component-based fallback', () => {
    it('maps criminal division component when no topic matches', () => {
      expect(classifyDojRelease('general news', 'Criminal Division')).toBe('criminal_prosecution');
    });

    it('maps civil division component', () => {
      expect(classifyDojRelease(undefined, 'Civil Division')).toBe('civil_litigation');
    });

    it('maps office of the attorney general', () => {
      expect(classifyDojRelease(undefined, 'Office of the Attorney General')).toBe(
        'office_of_attorney_general',
      );
    });
  });

  describe('case insensitivity', () => {
    it('handles uppercase topics', () => {
      expect(classifyDojRelease('CIVIL RIGHTS', undefined)).toBe('civil_rights_enforcement');
    });

    it('handles mixed case components', () => {
      expect(classifyDojRelease(undefined, 'criminal division')).toBe('criminal_prosecution');
    });
  });

  describe('partial matching', () => {
    it('matches partial topic strings', () => {
      expect(classifyDojRelease('terrorism and counterterrorism', undefined)).toBe(
        'national_security',
      );
    });

    it('matches partial component strings', () => {
      expect(classifyDojRelease(undefined, 'Environment and Natural Resources Division')).toBe(
        'environmental_enforcement',
      );
    });
  });

  describe('default behavior', () => {
    it('returns other for unknown topic and component', () => {
      expect(classifyDojRelease('unknown topic', 'unknown component')).toBe('other');
    });

    it('returns other for undefined inputs', () => {
      expect(classifyDojRelease(undefined, undefined)).toBe('other');
    });
  });
});

describe('DOJ_BUCKET_TO_CATEGORIES', () => {
  it('every bucket has a category mapping', () => {
    const allBuckets: DojInternalBucket[] = [
      'civil_rights_enforcement',
      'criminal_prosecution',
      'national_security',
      'antitrust',
      'environmental_enforcement',
      'consumer_protection',
      'immigration_enforcement',
      'public_corruption',
      'organized_crime',
      'cybercrime',
      'tax_enforcement',
      'civil_litigation',
      'office_of_attorney_general',
      'inspector_general',
      'other',
    ];
    for (const bucket of allBuckets) {
      expect(DOJ_BUCKET_TO_CATEGORIES[bucket]).toBeDefined();
      expect(DOJ_BUCKET_TO_CATEGORIES[bucket].length).toBeGreaterThan(0);
    }
  });
});

describe('mapping arrays', () => {
  it('DOJ_TOPIC_MAP patterns are non-empty', () => {
    for (const entry of DOJ_TOPIC_MAP) {
      expect(entry.patterns.length).toBeGreaterThan(0);
    }
  });

  it('DOJ_COMPONENT_MAP patterns are non-empty', () => {
    for (const entry of DOJ_COMPONENT_MAP) {
      expect(entry.patterns.length).toBeGreaterThan(0);
    }
  });
});
