import type { StatusLevel, AssessmentResult } from '@/lib/types';
import { ASSESSMENT_RULES } from '@/lib/data/assessment-rules';

export function analyzeContent(items: any[], category: string): AssessmentResult {
  const rules = ASSESSMENT_RULES[category];
  if (!rules) {
    return { status: 'Warning', reason: 'No assessment rules configured', matches: [] };
  }

  // Special case: Check if oversight.gov is down for igs category
  if (category === 'igs') {
    const oversightDown = items.some(item =>
      item.title?.includes('CURRENTLY DOWN') ||
      item.title?.includes('offline') ||
      item.note?.includes('lack of apportionment')
    );
    if (oversightDown) {
      return {
        status: 'Drift',
        reason: 'Oversight.gov (central IG portal) is offline due to funding issues',
        matches: ['oversight.gov shutdown']
      };
    }
  }

  let captureMatches: string[] = [];
  let driftMatches: string[] = [];
  let warningMatches: string[] = [];

  // Analyze each item with source weighting
  const highAuthorityKeywords: string[] = [];

  items.forEach(item => {
    const itemText = `${item.title || ''} ${item.summary || ''} ${item.note || ''} ${item.agency || ''}`.toLowerCase();

    // Source weighting: GAO decisions, court orders, and IG reports are authoritative
    const isHighAuthority = itemText.includes('gao') ||
                           itemText.includes('court') ||
                           itemText.includes('inspector general') ||
                           itemText.includes('violated') ||
                           itemText.includes('illegal') ||
                           itemText.includes('unlawful');

    // Check for temporal/pattern indicators
    const hasPatternLanguage = itemText.includes('unprecedented') ||
                               itemText.includes('systematic') ||
                               itemText.includes('pattern of') ||
                               itemText.includes('multiple') ||
                               itemText.includes('repeated');

    // Check keywords with context
    if (rules.keywords) {
      for (const keyword of rules.keywords.capture || []) {
        if (itemText.includes(keyword.toLowerCase())) {
          captureMatches.push(keyword);
          if (isHighAuthority) {
            highAuthorityKeywords.push(`${keyword} (authoritative source)`);
          }
        }
      }
      for (const keyword of rules.keywords.drift || []) {
        if (itemText.includes(keyword.toLowerCase())) {
          driftMatches.push(keyword);
          if (hasPatternLanguage) {
            captureMatches.push(`${keyword} (systematic pattern)`);
          }
        }
      }
      for (const keyword of rules.keywords.warning || []) {
        if (itemText.includes(keyword.toLowerCase())) {
          warningMatches.push(keyword);
        }
      }
    }
  });

  // Deduplicate matches
  captureMatches = [...new Set(captureMatches)];
  driftMatches = [...new Set(driftMatches)];
  warningMatches = [...new Set(warningMatches)];

  // Assess based on severity
  const itemCount = items.filter(i => !i.isError && !i.isWarning).length;

  if (captureMatches.length > 0) {
    const hasHighAuthority = highAuthorityKeywords.length > 0;
    return {
      status: 'Capture',
      reason: hasHighAuthority
        ? `Serious violations found by official sources (GAO, courts, or IGs): ${captureMatches.slice(0, 3).join(', ')}`
        : `Critical warning signs detected: ${captureMatches.slice(0, 3).join(', ')}`,
      matches: captureMatches,
      detail: {
        captureCount: captureMatches.length,
        driftCount: driftMatches.length,
        warningCount: warningMatches.length,
        itemsReviewed: itemCount,
        hasAuthoritative: hasHighAuthority
      }
    };
  }

  if (driftMatches.length >= 2) {
    return {
      status: 'Drift',
      reason: `Multiple concerning patterns found: ${driftMatches.slice(0, 3).join(', ')}`,
      matches: driftMatches,
      detail: {
        captureCount: 0,
        driftCount: driftMatches.length,
        warningCount: warningMatches.length,
        itemsReviewed: itemCount,
        hasAuthoritative: false
      }
    };
  }

  if (driftMatches.length === 1) {
    return {
      status: 'Warning',
      reason: `One concerning pattern detected: ${driftMatches[0]}`,
      matches: driftMatches,
      detail: {
        captureCount: 0,
        driftCount: 1,
        warningCount: warningMatches.length,
        itemsReviewed: itemCount,
        hasAuthoritative: false
      }
    };
  }

  if (warningMatches.length > 0) {
    return {
      status: 'Warning',
      reason: `Minor issues found: ${warningMatches.slice(0, 3).join(', ')}`,
      matches: warningMatches,
      detail: {
        captureCount: 0,
        driftCount: 0,
        warningCount: warningMatches.length,
        itemsReviewed: itemCount,
        hasAuthoritative: false
      }
    };
  }

  // Volume-based assessment
  if (rules.volumeThreshold) {
    if (itemCount >= rules.volumeThreshold.capture) {
      return {
        status: 'Drift',
        reason: `Very high activity level (${itemCount} documents) - may show increased government control`,
        matches: [],
        detail: {
          captureCount: 0,
          driftCount: 0,
          warningCount: 0,
          itemsReviewed: itemCount,
          hasAuthoritative: false
        }
      };
    }
    if (itemCount >= rules.volumeThreshold.drift) {
      return {
        status: 'Warning',
        reason: `Higher than normal activity (${itemCount} documents)`,
        matches: [],
        detail: {
          captureCount: 0,
          driftCount: 0,
          warningCount: 0,
          itemsReviewed: itemCount,
          hasAuthoritative: false
        }
      };
    }
  }

  // If we have successful data and no red flags, it's Stable
  if (itemCount > 0) {
    return {
      status: 'Stable',
      reason: 'Everything looks normal - no warning signs detected',
      matches: [],
      detail: {
        captureCount: 0,
        driftCount: 0,
        warningCount: 0,
        itemsReviewed: itemCount,
        hasAuthoritative: false
      }
    };
  }

  return {
    status: 'Warning',
    reason: 'Not enough information to make an assessment',
    matches: [],
    detail: {
      captureCount: 0,
      driftCount: 0,
      warningCount: 0,
      itemsReviewed: 0,
      hasAuthoritative: false
    }
  };
}
