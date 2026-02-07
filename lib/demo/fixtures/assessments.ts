/**
 * Pre-computed assessment results per category per scenario.
 * This avoids needing to craft feed items that trigger exact statuses
 * through the keyword engine's complex authority weighting.
 */

import type { StatusLevel, AssessmentResult, AssessmentDetail } from '@/lib/types';
import type { EnhancedAssessment } from '@/lib/services/ai-assessment-service';
import type { EvidenceItem } from '@/lib/services/evidence-balance';
import type { ScenarioName } from '../scenarios';
import { DEMO_SCENARIOS } from '../scenarios';

function makeDetail(status: StatusLevel, itemCount: number): AssessmentDetail {
  const detail: AssessmentDetail = {
    captureCount: 0,
    driftCount: 0,
    warningCount: 0,
    itemsReviewed: itemCount,
    hasAuthoritative: true,
  };
  switch (status) {
    case 'Capture':
      detail.captureCount = 4;
      detail.driftCount = 2;
      detail.warningCount = 1;
      break;
    case 'Drift':
      detail.driftCount = 3;
      detail.warningCount = 2;
      break;
    case 'Warning':
      detail.warningCount = 3;
      break;
    case 'Stable':
      detail.warningCount = 0;
      break;
  }
  return detail;
}

const REASONS: Record<string, Record<StatusLevel, string>> = {
  civilService: {
    Stable:
      'Civil service protections appear to be functioning normally. OPM activities are routine.',
    Warning:
      'Some concerning language in OPM notices about workforce restructuring, but no direct action on Schedule F.',
    Drift:
      'Schedule F reclassification orders have been issued. Career positions are being converted to at-will employment.',
    Capture:
      'Mass reclassification of career civil servants underway. OPM is operating under direct White House control, bypassing merit system protections.',
  },
  fiscal: {
    Stable:
      'Congressional appropriations are being executed on schedule. No impoundment activity detected.',
    Warning:
      'OMB has issued guidance on spending reviews that could delay fund obligations. GAO is monitoring.',
    Drift:
      'Multiple programs show delayed obligation of congressionally-appropriated funds. GAO has flagged potential ICA violations.',
    Capture:
      'Systematic withholding of appropriated funds across multiple agencies. GAO has issued formal opinions finding ICA violations.',
  },
  igs: {
    Stable:
      'Inspectors General are operating independently. Reports are being published on schedule.',
    Warning: 'Some IG positions remain vacant. Oversight.gov access has been intermittent.',
    Drift:
      'Multiple IGs have reported interference with investigations. Access to agency records has been restricted.',
    Capture:
      'Oversight.gov has been taken offline. Multiple IGs fired without required congressional notification. Investigations blocked.',
  },
  hatch: {
    Stable: 'OSC is actively enforcing the Hatch Act. No significant violations reported.',
    Warning:
      'OSC has received increased complaints about political activity by senior officials. Investigations ongoing.',
    Drift:
      'Pattern of Hatch Act violations by senior officials with minimal enforcement. OSC complaints are being delayed.',
    Capture:
      'Systematic politicization of the federal workforce. OSC enforcement effectively neutralized.',
  },
  courts: {
    Stable: 'Federal agencies are complying with court orders in a timely manner.',
    Warning:
      'Some agencies have requested extensions on compliance timelines. DOJ is seeking stays on recent injunctions.',
    Drift:
      'Multiple instances of delayed or partial compliance with federal court orders. Contempt motions filed.',
    Capture:
      'Open defiance of federal court orders. Executive branch agencies refusing to comply with injunctions.',
  },
  military: {
    Stable: 'Military operations within normal parameters. No domestic deployment concerns.',
    Warning:
      'Increased rhetoric about domestic use of military. National Guard deployments to border expanding.',
    Drift:
      'Active-duty troops deployed for domestic law enforcement. Posse Comitatus concerns raised by legal experts.',
    Capture:
      'Military assets routinely used for domestic policing. Insurrection Act invoked without clear justification.',
  },
  rulemaking: {
    Stable: 'Independent agencies are following standard notice-and-comment procedures.',
    Warning: 'Regulatory freeze in effect. Several proposed rules withdrawn for further review.',
    Drift:
      'Independent agencies receiving direct White House directives on rulemaking priorities. Comment periods shortened.',
    Capture:
      'Agency independence effectively eliminated. Rules issued without proper APA procedures under executive pressure.',
  },
  indices: {
    Stable:
      'Normal volume and type of executive actions. Democratic indicators are within historical norms.',
    Warning:
      'Executive order volume elevated. Several actions push boundaries of existing authority.',
    Drift:
      'Significant expansion of executive authority through unilateral action. Emergency declarations used to bypass Congress.',
    Capture: 'Governance by executive decree. Congressional authority systematically circumvented.',
  },
  infoAvailability: {
    Stable:
      'All monitored government websites are accessible. Reports are being published on schedule.',
    Warning:
      'Some intermittent access issues detected. One or two sites showing degraded performance.',
    Drift:
      'Multiple government transparency sites experiencing outages. Report publication delays detected.',
    Capture:
      'Critical government websites taken offline. Systematic suppression of public information.',
  },
};

const MATCHES: Record<StatusLevel, string[]> = {
  Stable: [],
  Warning: ['unusual activity', 'increased volume', 'monitoring required'],
  Drift: ['systematic pattern', 'repeated violations', 'escalating concerns', 'authority exceeded'],
  Capture: [
    'institutional capture',
    'systematic',
    'defiance',
    'mass removal',
    'independence eliminated',
  ],
};

function getAssessment(category: string, scenario: ScenarioName): AssessmentResult {
  const status = DEMO_SCENARIOS[scenario].categories[category]?.status ?? 'Stable';
  return {
    status,
    reason: REASONS[category]?.[status] ?? `Category is currently assessed as ${status}.`,
    matches: MATCHES[status],
    detail: makeDetail(status, 8),
  };
}

function getEnhanced(category: string, scenario: ScenarioName): EnhancedAssessment {
  const base = getAssessment(category, scenario);
  const status = base.status;

  const evidenceFor: EvidenceItem[] =
    status === 'Stable'
      ? []
      : [
          {
            text: `Official documents indicate ${status.toLowerCase()}-level activity in ${category}`,
            direction: 'concerning',
          },
          {
            text: `Pattern analysis shows elevated keyword frequency for ${category} signals`,
            direction: 'concerning',
          },
        ];

  const evidenceAgainst: EvidenceItem[] = [
    { text: 'Some institutional safeguards remain active', direction: 'reassuring' },
    ...(status !== 'Capture'
      ? [
          {
            text: 'Historical context suggests periodic fluctuations are normal',
            direction: 'reassuring' as const,
          },
        ]
      : []),
  ];

  const dataCoverage =
    status === 'Capture' ? 0.85 : status === 'Drift' ? 0.72 : status === 'Warning' ? 0.65 : 0.9;

  return {
    category,
    status,
    reason: base.reason,
    matches: base.matches,
    dataCoverage,
    dataCoverageFactors: {
      sourceAuthority: 0.8,
      evidenceVolume: status === 'Capture' ? 0.9 : 0.6,
      patternConsistency: status === 'Drift' || status === 'Capture' ? 0.85 : 0.5,
      temporalCoverage: 0.7,
    },
    evidenceFor,
    evidenceAgainst,
    howWeCouldBeWrong: [
      'Administrative changes may reflect legitimate reorganization rather than institutional capture',
      'Keyword matching may over-count related documents discussing the same event',
      'Some source material may be outdated or superseded by more recent actions',
    ],
    keywordResult: base,
    aiResult: {
      provider: 'demo',
      model: 'demo-fixture',
      status,
      reasoning:
        base.reason +
        ' This assessment is based on analysis of recent official documents and regulatory filings.',
      confidence: dataCoverage,
      tokensUsed: { input: 1200, output: 450 },
      latencyMs: 0,
    },
    consensusNote: 'AI and keyword assessments agree on the current status level.',
    assessedAt: new Date().toISOString(),
  };
}

export function getDemoAssessment(
  category: string,
  scenario: ScenarioName,
  enhanced: boolean,
): AssessmentResult | EnhancedAssessment {
  if (enhanced) {
    return getEnhanced(category, scenario);
  }
  return getAssessment(category, scenario);
}
