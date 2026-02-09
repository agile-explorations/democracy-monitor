import { ASSESSMENT_RULES } from '@/lib/data/assessment-rules';
import { isHighAuthoritySource } from '@/lib/data/authority-sources';
import type { AssessmentResult, ContentItem } from '@/lib/types';
import { matchKeyword } from '@/lib/utils/keyword-match';

export function analyzeContent(items: ContentItem[], category: string): AssessmentResult {
  const rules = ASSESSMENT_RULES[category];
  if (!rules) {
    return { status: 'Warning', reason: 'No assessment rules configured', matches: [] };
  }

  // Special case: Check if oversight.gov is down for igs category
  if (category === 'igs') {
    const oversightDown = items.some(
      (item) =>
        item.title?.includes('CURRENTLY DOWN') ||
        item.title?.includes('offline') ||
        item.note?.includes('lack of apportionment'),
    );
    if (oversightDown) {
      return {
        status: 'Drift',
        reason: 'Oversight.gov (central IG portal) is offline due to funding issues',
        matches: ['oversight.gov shutdown'],
      };
    }
  }

  let captureMatches: string[] = [];
  let driftMatches: string[] = [];
  let warningMatches: string[] = [];

  // Analyze each item with source weighting
  const highAuthorityKeywords: string[] = [];

  items.forEach((item) => {
    // Content text: only title + summary (actual document content)
    // Excluded: note (our editorial descriptions), agency (source metadata)
    const contentText = `${item.title || ''} ${item.summary || ''}`;

    // Authority: determined by source agency field, not content keywords
    const isHighAuthority = isHighAuthoritySource(item.agency);

    // Check for temporal/pattern indicators in content text only
    const hasPatternLanguage =
      matchKeyword(contentText, 'unprecedented') ||
      matchKeyword(contentText, 'systematic') ||
      matchKeyword(contentText, 'pattern of') ||
      matchKeyword(contentText, 'multiple') ||
      matchKeyword(contentText, 'repeated');

    // Check keywords against content text only (not note or agency metadata)
    if (rules.keywords) {
      for (const keyword of rules.keywords.capture || []) {
        if (matchKeyword(contentText, keyword)) {
          captureMatches.push(keyword);
          if (isHighAuthority) {
            highAuthorityKeywords.push(`${keyword} (authoritative source)`);
          }
        }
      }
      for (const keyword of rules.keywords.drift || []) {
        if (matchKeyword(contentText, keyword)) {
          driftMatches.push(keyword);
          if (hasPatternLanguage) {
            captureMatches.push(`${keyword} (systematic pattern)`);
          }
        }
      }
      for (const keyword of rules.keywords.warning || []) {
        if (matchKeyword(contentText, keyword)) {
          warningMatches.push(keyword);
        }
      }
    }
  });

  // Deduplicate matches
  captureMatches = [...new Set(captureMatches)];
  driftMatches = [...new Set(driftMatches)];
  warningMatches = [...new Set(warningMatches)];

  // Assess based on severity — require corroboration for Capture
  const itemCount = items.filter((i) => !i.isError && !i.isWarning).length;
  const hasHighAuthority = highAuthorityKeywords.length > 0;

  if (captureMatches.length >= 2) {
    // 2+ capture matches → Capture
    return {
      status: 'Capture',
      reason: hasHighAuthority
        ? `Serious violations found by official sources (GAO, courts, or IGs): ${captureMatches.slice(0, 3).join(', ')}`
        : `Multiple critical warning signs detected: ${captureMatches.slice(0, 3).join(', ')}`,
      matches: captureMatches,
      detail: {
        captureCount: captureMatches.length,
        driftCount: driftMatches.length,
        warningCount: warningMatches.length,
        itemsReviewed: itemCount,
        hasAuthoritative: hasHighAuthority,
      },
    };
  }

  if (captureMatches.length === 1) {
    // Single capture match → Drift (requires corroboration for Capture)
    return {
      status: 'Drift',
      reason: `Critical warning sign detected but needs corroboration: ${captureMatches[0]}`,
      matches: [...captureMatches, ...driftMatches],
      detail: {
        captureCount: captureMatches.length,
        driftCount: driftMatches.length,
        warningCount: warningMatches.length,
        itemsReviewed: itemCount,
        hasAuthoritative: hasHighAuthority,
      },
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
        hasAuthoritative: false,
      },
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
        hasAuthoritative: false,
      },
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
        hasAuthoritative: false,
      },
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
          hasAuthoritative: false,
        },
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
          hasAuthoritative: false,
        },
      };
    }
  }

  // If we have successful data and no red flags, it's Stable
  if (itemCount >= 3) {
    return {
      status: 'Stable',
      reason: 'Everything looks normal - no warning signs detected',
      matches: [],
      detail: {
        captureCount: 0,
        driftCount: 0,
        warningCount: 0,
        itemsReviewed: itemCount,
        hasAuthoritative: false,
      },
    };
  }

  // Insufficient data — not enough items for a reliable assessment
  return {
    status: 'Warning',
    reason:
      itemCount === 0
        ? 'Not enough information to make an assessment'
        : `Only ${itemCount} source${itemCount === 1 ? '' : 's'} available — insufficient for a reliable assessment`,
    matches: [],
    detail: {
      captureCount: 0,
      driftCount: 0,
      warningCount: 0,
      itemsReviewed: itemCount,
      hasAuthoritative: false,
      insufficientData: true,
    },
  };
}
