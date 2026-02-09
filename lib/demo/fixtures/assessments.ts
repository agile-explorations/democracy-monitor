/**
 * Pre-computed assessment results per category per scenario.
 * This avoids needing to craft feed items that trigger exact statuses
 * through the keyword engine's complex authority weighting.
 */

import type {
  EnhancedAssessment,
  EvidenceItem,
  StatusLevel,
  AssessmentResult,
  AssessmentDetail,
  DebateResult,
  LegalAnalysisResult,
  TrendAnomaly,
} from '@/lib/types';
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

// --- Deep analysis fixtures --------------------------------------------------

const DEBATE_TOPICS: Record<string, Record<StatusLevel, string>> = {
  civilService: {
    Stable: '',
    Warning: '',
    Drift:
      'Whether Schedule F reclassifications constitute a systematic dismantling of merit-based civil service protections or a legitimate exercise of executive reorganization authority.',
    Capture:
      'Whether the mass conversion of career civil servants to at-will employment represents institutional capture of the federal workforce.',
  },
  fiscal: {
    Stable: '',
    Warning: '',
    Drift:
      'Whether delayed fund obligations constitute unlawful impoundment under the Impoundment Control Act or permissible executive budget management.',
    Capture:
      'Whether the systematic withholding of congressionally appropriated funds represents a constitutional crisis in the power of the purse.',
  },
  igs: {
    Stable: '',
    Warning: '',
    Drift:
      'Whether restrictions on IG access to agency records undermine the independent oversight function established by the Inspector General Act.',
    Capture:
      'Whether the removal of multiple Inspectors General and shutdown of Oversight.gov constitutes destruction of the federal oversight apparatus.',
  },
  hatch: {
    Stable: '',
    Warning: '',
    Drift:
      'Whether the pattern of unenforced Hatch Act violations signals a breakdown in the boundary between political and civil service functions.',
    Capture:
      'Whether the neutralization of OSC enforcement represents a complete politicization of the federal workforce.',
  },
  courts: {
    Stable: '',
    Warning: '',
    Drift:
      'Whether delayed compliance with federal court orders represents a challenge to judicial authority or reasonable administrative process.',
    Capture:
      'Whether open defiance of court injunctions constitutes a constitutional crisis threatening the separation of powers.',
  },
  military: {
    Stable: '',
    Warning: '',
    Drift:
      'Whether domestic deployment of active-duty troops for law enforcement violates the Posse Comitatus Act.',
    Capture:
      'Whether routine military use for domestic policing represents a fundamental shift in civil-military relations.',
  },
  rulemaking: {
    Stable: '',
    Warning: '',
    Drift:
      'Whether White House directives to independent agencies compromise the regulatory independence established by Congress.',
    Capture:
      'Whether bypassing APA procedures under executive pressure eliminates meaningful regulatory independence.',
  },
  indices: {
    Stable: '',
    Warning: '',
    Drift:
      'Whether the expansion of executive authority through emergency declarations circumvents constitutional checks on presidential power.',
    Capture:
      'Whether governance by executive decree represents a fundamental departure from constitutional democratic norms.',
  },
  infoAvailability: {
    Stable: '',
    Warning: '',
    Drift:
      'Whether government website outages and publication delays reflect infrastructure issues or deliberate information suppression.',
    Capture:
      'Whether taking critical transparency sites offline constitutes systematic suppression of public information.',
  },
};

function makeDebate(
  category: string,
  status: StatusLevel,
  reason: string,
): DebateResult | undefined {
  if (status !== 'Drift' && status !== 'Capture') return undefined;
  const topic =
    DEBATE_TOPICS[category]?.[status] || `Analysis of ${status}-level activity in ${category}`;
  const isConcerning = status === 'Capture';
  return {
    category,
    status,
    messages: [
      {
        role: 'prosecutor',
        provider: 'demo',
        model: 'demo-fixture',
        content: `The evidence strongly suggests ${status.toLowerCase()}-level concern. ${reason} These actions follow a pattern consistent with institutional erosion rather than routine governance.`,
        round: 1,
        latencyMs: 0,
      },
      {
        role: 'defense',
        provider: 'demo',
        model: 'demo-fixture',
        content: `While the actions described are notable, they should be evaluated in historical context. Executive reorganization and policy shifts occur in every administration. The characterization of these actions as ${status.toLowerCase()} may overweight their significance.`,
        round: 1,
        latencyMs: 0,
      },
      {
        role: 'arbitrator',
        provider: 'demo',
        model: 'demo-fixture',
        content: isConcerning
          ? `After weighing both perspectives, the evidence supports a concerning assessment. The pattern of actions in ${category} goes beyond normal policy disagreement and raises legitimate institutional concerns.`
          : `Both sides present valid points. While the actions warrant monitoring, the evidence is mixed. Some indicators suggest institutional stress, but existing safeguards have not been fully tested.`,
        round: 1,
        latencyMs: 0,
      },
    ],
    verdict: {
      agreementLevel: isConcerning ? 8 : 5,
      verdict: isConcerning ? 'concerning' : 'mixed',
      summary: topic,
      keyPoints: [
        `${status}-level activity detected across multiple signals`,
        reason.split('.')[0],
        isConcerning
          ? 'Pattern is consistent with systematic institutional erosion'
          : 'Further monitoring recommended to establish trend direction',
      ],
    },
    totalRounds: 1,
    startedAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
    totalLatencyMs: 0,
  };
}

const LEGAL_REFS: Record<string, { citation: string; title: string; type: string }[]> = {
  civilService: [
    { citation: '5 U.S.C. \u00A7 2301-2302', title: 'Merit System Principles', type: 'statute' },
    { citation: 'EO 13957 (2020)', title: 'Schedule F Executive Order', type: 'regulation' },
  ],
  fiscal: [
    {
      citation: '2 U.S.C. \u00A7 681-688',
      title: 'Impoundment Control Act of 1974',
      type: 'statute',
    },
    {
      citation: 'Train v. City of New York, 420 U.S. 35 (1975)',
      title: 'Train v. NYC',
      type: 'case',
    },
  ],
  igs: [
    {
      citation: '5 U.S.C. App. \u00A7 3(b)',
      title: 'Inspector General Act of 1978',
      type: 'statute',
    },
    {
      citation: '5 U.S.C. App. \u00A7 8G',
      title: 'IG Removal Notification Requirement',
      type: 'statute',
    },
  ],
  hatch: [
    { citation: '5 U.S.C. \u00A7 7321-7326', title: 'Hatch Act', type: 'statute' },
    {
      citation: '5 U.S.C. \u00A7 1212-1216',
      title: 'Office of Special Counsel Act',
      type: 'statute',
    },
  ],
  courts: [
    { citation: 'U.S. Const. Art. III', title: 'Judicial Power', type: 'constitutional' },
    { citation: 'Cooper v. Aaron, 358 U.S. 1 (1958)', title: 'Cooper v. Aaron', type: 'case' },
  ],
  military: [
    { citation: '18 U.S.C. \u00A7 1385', title: 'Posse Comitatus Act', type: 'statute' },
    { citation: '10 U.S.C. \u00A7 251-255', title: 'Insurrection Act', type: 'statute' },
  ],
  rulemaking: [
    {
      citation: '5 U.S.C. \u00A7 553',
      title: 'Administrative Procedure Act — Rulemaking',
      type: 'statute',
    },
    {
      citation: "Humphrey's Executor v. United States, 295 U.S. 602 (1935)",
      title: "Humphrey's Executor",
      type: 'case',
    },
  ],
  indices: [
    {
      citation: 'U.S. Const. Art. I, \u00A7 1',
      title: 'Legislative Power Vesting Clause',
      type: 'constitutional',
    },
    {
      citation: 'Youngstown Sheet & Tube Co. v. Sawyer, 343 U.S. 579 (1952)',
      title: 'Youngstown',
      type: 'case',
    },
  ],
  infoAvailability: [
    { citation: '5 U.S.C. \u00A7 552', title: 'Freedom of Information Act', type: 'statute' },
    { citation: '44 U.S.C. \u00A7 3501', title: 'Paperwork Reduction Act', type: 'statute' },
  ],
};

function makeLegalAnalysis(
  category: string,
  status: StatusLevel,
  reason: string,
): LegalAnalysisResult | undefined {
  if (status !== 'Drift' && status !== 'Capture') return undefined;
  const refs = LEGAL_REFS[category] || [];
  return {
    category,
    status,
    citations: refs.map((r) => ({
      ...r,
      relevance: `Relevant to current ${status.toLowerCase()}-level activity in ${category}`,
      verified: true,
    })),
    analysis: `${reason} This raises questions under ${refs.map((r) => r.title).join(' and ')}.`,
    constitutionalConcerns:
      status === 'Capture'
        ? [
            `Potential violation of separation of powers in ${category}`,
            'Actions may exceed constitutional executive authority',
          ]
        : [`Actions in ${category} warrant constitutional scrutiny`],
    precedents: refs.filter((r) => r.type === 'case').map((r) => `${r.title} (${r.citation})`),
    provider: 'demo',
    model: 'demo-fixture',
    latencyMs: 0,
  };
}

function makeTrendAnomalies(category: string, status: StatusLevel): TrendAnomaly[] {
  if (status === 'Stable') return [];
  const now = new Date().toISOString();
  const anomalies: TrendAnomaly[] = [
    {
      keyword: status === 'Capture' ? 'institutional capture' : 'executive authority',
      category,
      ratio: status === 'Capture' ? 4.2 : status === 'Drift' ? 2.8 : 1.6,
      severity: status === 'Capture' ? 'high' : status === 'Drift' ? 'medium' : 'low',
      message: `Keyword frequency ${status === 'Capture' ? '4.2x' : status === 'Drift' ? '2.8x' : '1.6x'} above baseline for ${category}`,
      detectedAt: now,
    },
  ];
  if (status === 'Capture' || status === 'Drift') {
    anomalies.push({
      keyword: 'oversight',
      category,
      ratio: status === 'Capture' ? 3.5 : 2.1,
      severity: status === 'Capture' ? 'high' : 'medium',
      message: `Oversight-related keyword frequency elevated ${status === 'Capture' ? '3.5x' : '2.1x'} above baseline`,
      detectedAt: now,
    });
  }
  return anomalies;
}

// --- Enhanced assessment builder ---------------------------------------------

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
    debate: makeDebate(category, status, base.reason),
    legalAnalysis: makeLegalAnalysis(category, status, base.reason),
    trendAnomalies: makeTrendAnomalies(category, status),
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
