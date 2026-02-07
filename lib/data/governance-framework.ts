import type { GovernanceFrameworkEntry } from '@/lib/types/intent';

export const GOVERNANCE_FRAMEWORK: GovernanceFrameworkEntry[] = [
  {
    key: 'liberal_democracy',
    label: 'Liberal Democracy',
    description: 'Full respect for rule of law, independent institutions, free press, civil liberties, and competitive elections.',
    indicators: [
      'Compliance with court orders',
      'Respect for inspector general independence',
      'Transparent regulatory process',
      'Support for free press',
      'Acceptance of election results',
    ],
    scoreRange: [-2, -1],
  },
  {
    key: 'competitive_authoritarian',
    label: 'Competitive Authoritarian',
    description: 'Democratic institutions exist but are systematically undermined. Elections occur but the playing field is tilted.',
    indicators: [
      'Selective enforcement of laws',
      'Pressure on independent agencies',
      'Attacks on media credibility',
      'Norm-breaking without law-breaking',
      'Loyalty tests for appointees',
    ],
    scoreRange: [-0.5, 0.5],
  },
  {
    key: 'executive_dominant',
    label: 'Executive Dominant',
    description: 'Executive branch has accumulated significant power over other branches. Checks and balances weakened but not eliminated.',
    indicators: [
      'Ignoring congressional subpoenas',
      'Overriding agency independence',
      'Impounding appropriated funds',
      'Mass removal of inspectors general',
      'Expanding executive privilege claims',
    ],
    scoreRange: [0.5, 1.5],
  },
  {
    key: 'illiberal_democracy',
    label: 'Illiberal Democracy',
    description: 'Elections continue but civil liberties, rule of law, and minority rights are eroded. Institutions serve the executive.',
    indicators: [
      'Defiance of court orders',
      'Politicization of law enforcement',
      'Restriction of press access',
      'Weaponization of regulatory power',
      'Erosion of civil service protections',
    ],
    scoreRange: [1, 1.75],
  },
  {
    key: 'personalist_rule',
    label: 'Personalist Rule',
    description: 'Power fully concentrated in one person. Institutions exist in name only. Rule of law replaced by rule by law.',
    indicators: [
      'Open defiance of all court orders',
      'Military deployed domestically',
      'Press suppressed or co-opted',
      'Elections manipulated or suspended',
      'No independent oversight remaining',
    ],
    scoreRange: [1.75, 2],
  },
];

export function classifyGovernance(score: number): GovernanceFrameworkEntry {
  // Find best matching category based on score
  for (const entry of GOVERNANCE_FRAMEWORK) {
    if (score >= entry.scoreRange[0] && score <= entry.scoreRange[1]) {
      return entry;
    }
  }
  // Default to closest match
  if (score < GOVERNANCE_FRAMEWORK[0].scoreRange[0]) return GOVERNANCE_FRAMEWORK[0];
  return GOVERNANCE_FRAMEWORK[GOVERNANCE_FRAMEWORK.length - 1];
}
