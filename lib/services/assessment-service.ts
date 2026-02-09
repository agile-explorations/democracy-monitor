import { ASSESSMENT_RULES } from '@/lib/data/assessment-rules';
import { isHighAuthoritySource } from '@/lib/data/authority-sources';
import type { AssessmentResult, ContentItem } from '@/lib/types';
import { matchKeyword } from '@/lib/utils/keyword-match';

/** Minimum capture-keyword matches to escalate to Capture status. */
const CAPTURE_MATCH_THRESHOLD = 2;
/** Minimum drift-keyword matches to escalate to Drift status. */
const DRIFT_MATCH_THRESHOLD = 2;
/** Maximum keyword matches shown in reason text. */
const MAX_REASON_MATCHES = 3;
/** Minimum valid items needed to assess as Stable (below this → insufficient data). */
const MIN_ITEMS_FOR_STABLE = 3;

interface AssessmentDetail {
  captureCount: number;
  driftCount: number;
  warningCount: number;
  itemsReviewed: number;
  hasAuthoritative: boolean;
  insufficientData?: boolean;
}

interface KeywordScanResult {
  captureMatches: string[];
  driftMatches: string[];
  warningMatches: string[];
  highAuthorityKeywords: string[];
}

function makeResult(
  status: AssessmentResult['status'],
  reason: string,
  matches: string[],
  detail: AssessmentDetail,
): AssessmentResult {
  return { status, reason, matches, detail };
}

function checkIgsOverride(items: ContentItem[]): AssessmentResult | null {
  const oversightDown = items.some(
    (item) =>
      item.title?.includes('CURRENTLY DOWN') ||
      item.title?.includes('offline') ||
      item.note?.includes('lack of apportionment'),
  );
  if (!oversightDown) return null;
  return {
    status: 'Drift',
    reason: 'Oversight.gov (central IG portal) is offline due to funding issues',
    matches: ['oversight.gov shutdown'],
  };
}

function scanKeywords(
  items: ContentItem[],
  rules: (typeof ASSESSMENT_RULES)[string],
): KeywordScanResult {
  let captureMatches: string[] = [];
  let driftMatches: string[] = [];
  let warningMatches: string[] = [];
  const highAuthorityKeywords: string[] = [];

  for (const item of items) {
    const contentText = `${item.title || ''} ${item.summary || ''}`;
    const isHighAuthority = isHighAuthoritySource(item.agency);
    const hasPatternLanguage =
      matchKeyword(contentText, 'unprecedented') ||
      matchKeyword(contentText, 'systematic') ||
      matchKeyword(contentText, 'pattern of') ||
      matchKeyword(contentText, 'multiple') ||
      matchKeyword(contentText, 'repeated');

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
  }

  captureMatches = [...new Set(captureMatches)];
  driftMatches = [...new Set(driftMatches)];
  warningMatches = [...new Set(warningMatches)];

  return { captureMatches, driftMatches, warningMatches, highAuthorityKeywords };
}

function makeDetail(
  captureCount: number,
  driftCount: number,
  warningCount: number,
  itemsReviewed: number,
  hasAuthoritative: boolean,
) {
  return { captureCount, driftCount, warningCount, itemsReviewed, hasAuthoritative };
}

function buildAssessmentResult(
  scan: KeywordScanResult,
  itemCount: number,
  rules: (typeof ASSESSMENT_RULES)[string],
): AssessmentResult {
  const { captureMatches, driftMatches, warningMatches, highAuthorityKeywords } = scan;
  const hasAuth = highAuthorityKeywords.length > 0;
  const detail = makeDetail(
    captureMatches.length,
    driftMatches.length,
    warningMatches.length,
    itemCount,
    hasAuth,
  );

  if (captureMatches.length >= CAPTURE_MATCH_THRESHOLD) {
    const reason = hasAuth
      ? `Serious violations found by official sources (GAO, courts, or IGs): ${captureMatches.slice(0, MAX_REASON_MATCHES).join(', ')}`
      : `Multiple critical warning signs detected: ${captureMatches.slice(0, MAX_REASON_MATCHES).join(', ')}`;
    return makeResult('Capture', reason, captureMatches, detail);
  }

  if (captureMatches.length === 1) {
    return makeResult(
      'Drift',
      `Critical warning sign detected but needs corroboration: ${captureMatches[0]}`,
      [...captureMatches, ...driftMatches],
      detail,
    );
  }

  if (driftMatches.length >= DRIFT_MATCH_THRESHOLD) {
    return makeResult(
      'Drift',
      `Multiple concerning patterns found: ${driftMatches.slice(0, MAX_REASON_MATCHES).join(', ')}`,
      driftMatches,
      { ...detail, captureCount: 0, hasAuthoritative: false },
    );
  }

  if (driftMatches.length === 1) {
    return makeResult(
      'Warning',
      `One concerning pattern detected: ${driftMatches[0]}`,
      driftMatches,
      { ...detail, captureCount: 0, driftCount: 1, hasAuthoritative: false },
    );
  }

  if (warningMatches.length > 0) {
    return makeResult(
      'Warning',
      `Minor issues found: ${warningMatches.slice(0, MAX_REASON_MATCHES).join(', ')}`,
      warningMatches,
      { ...detail, captureCount: 0, driftCount: 0, hasAuthoritative: false },
    );
  }

  return assessByVolume(itemCount, rules);
}

function assessByVolume(
  itemCount: number,
  rules: (typeof ASSESSMENT_RULES)[string],
): AssessmentResult {
  const base = {
    captureCount: 0,
    driftCount: 0,
    warningCount: 0,
    itemsReviewed: itemCount,
    hasAuthoritative: false,
  };

  if (rules.volumeThreshold) {
    if (itemCount >= rules.volumeThreshold.capture) {
      return makeResult(
        'Drift',
        `Very high activity level (${itemCount} documents) - may show increased government control`,
        [],
        base,
      );
    }
    if (itemCount >= rules.volumeThreshold.drift) {
      return makeResult(
        'Warning',
        `Higher than normal activity (${itemCount} documents)`,
        [],
        base,
      );
    }
  }

  if (itemCount >= MIN_ITEMS_FOR_STABLE) {
    return makeResult('Stable', 'Everything looks normal - no warning signs detected', [], base);
  }

  return makeResult(
    'Warning',
    itemCount === 0
      ? 'Not enough information to make an assessment'
      : `Only ${itemCount} source${itemCount === 1 ? '' : 's'} available — insufficient for a reliable assessment`,
    [],
    { ...base, insufficientData: true },
  );
}

export function analyzeContent(items: ContentItem[], category: string): AssessmentResult {
  const rules = ASSESSMENT_RULES[category];
  if (!rules) {
    return { status: 'Warning', reason: 'No assessment rules configured', matches: [] };
  }

  if (category === 'igs') {
    const override = checkIgsOverride(items);
    if (override) return override;
  }

  const scan = scanKeywords(items, rules);
  const itemCount = items.filter((i) => !i.isError && !i.isWarning).length;
  return buildAssessmentResult(scan, itemCount, rules);
}
