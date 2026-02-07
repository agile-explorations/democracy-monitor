import type { StatusLevel } from '@/lib/types';
import type { GovernanceCategory, CrossReference } from '@/lib/types/intent';

// Interpretation matrix: intent category x institutional status
const INTERPRETATION_MATRIX: Record<
  GovernanceCategory,
  Record<StatusLevel, { interpretation: string; severity: CrossReference['severity'] }>
> = {
  liberal_democracy: {
    Stable: {
      interpretation:
        'Democratic intent with healthy institutions — system functioning as designed',
      severity: 'low',
    },
    Warning: {
      interpretation:
        'Democratic intent but some institutional friction — normal democratic tensions',
      severity: 'low',
    },
    Drift: {
      interpretation:
        'Democratic intent but institutions under stress — external pressures may be at play',
      severity: 'medium',
    },
    Capture: {
      interpretation:
        'Claims democratic intent but institutions captured — possible gap between rhetoric and reality',
      severity: 'high',
    },
  },
  competitive_authoritarian: {
    Stable: {
      interpretation:
        'Mixed signals with stable institutions — institutions may be providing effective check',
      severity: 'low',
    },
    Warning: {
      interpretation: 'Norm-erosion underway — institutions beginning to feel pressure',
      severity: 'medium',
    },
    Drift: {
      interpretation:
        'Institutions straining but holding — critical period for democratic resilience',
      severity: 'high',
    },
    Capture: {
      interpretation:
        'Institutions failing to check executive — competitive authoritarianism advancing',
      severity: 'critical',
    },
  },
  executive_dominant: {
    Stable: {
      interpretation:
        'Executive expansion with institutional resistance — checks still functioning',
      severity: 'medium',
    },
    Warning: {
      interpretation: 'Executive dominance growing — institutional pushback weakening',
      severity: 'high',
    },
    Drift: {
      interpretation:
        'Significant executive overreach — institutions struggling to maintain independence',
      severity: 'high',
    },
    Capture: {
      interpretation: 'Executive has captured key institutions — urgent democratic concern',
      severity: 'critical',
    },
  },
  illiberal_democracy: {
    Stable: {
      interpretation: 'Illiberal intent but institutions holding — democratic structures resisting',
      severity: 'medium',
    },
    Warning: {
      interpretation: 'Illiberal pressure mounting — some institutions beginning to yield',
      severity: 'high',
    },
    Drift: {
      interpretation: 'Democratic backsliding accelerating — institutional barriers eroding',
      severity: 'critical',
    },
    Capture: {
      interpretation: 'Democratic institutions captured by illiberal forces — systemic crisis',
      severity: 'critical',
    },
  },
  personalist_rule: {
    Stable: {
      interpretation:
        'Extreme rhetoric but institutions still functioning — significant gap between words and reality',
      severity: 'medium',
    },
    Warning: {
      interpretation: 'Personalist tendencies with weakening institutions — concerning trajectory',
      severity: 'high',
    },
    Drift: {
      interpretation: 'Institutions failing to resist personalist control — democratic emergency',
      severity: 'critical',
    },
    Capture: {
      interpretation: 'Full institutional capture — democratic system in crisis',
      severity: 'critical',
    },
  },
};

export function getCrossReference(
  intentCategory: GovernanceCategory,
  institutionalStatus: StatusLevel,
): CrossReference {
  const entry = INTERPRETATION_MATRIX[intentCategory][institutionalStatus];
  return {
    intentCategory,
    institutionalStatus,
    interpretation: entry.interpretation,
    severity: entry.severity,
  };
}

export function getAllCrossReferences(
  intentCategory: GovernanceCategory,
  statusMap: Record<string, string>,
): Record<string, CrossReference> {
  const refs: Record<string, CrossReference> = {};

  for (const [category, status] of Object.entries(statusMap)) {
    if (['Stable', 'Warning', 'Drift', 'Capture'].includes(status)) {
      refs[category] = getCrossReference(intentCategory, status as StatusLevel);
    }
  }

  return refs;
}
