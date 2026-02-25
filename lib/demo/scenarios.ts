import type { StatusLevel, GovernanceCategory } from '@/lib/types';

export interface CategoryScenario {
  status: StatusLevel;
}

export interface DemoScenarioConfig {
  categories: Record<string, CategoryScenario>;
  intent: {
    overall: GovernanceCategory;
    rhetoricScore: number;
    actionScore: number;
  };
  uptimeDownCount: number;
}

export type ScenarioName = 'mixed' | 'stable' | 'crisis' | 'degrading';

export const DEMO_SCENARIOS: Record<ScenarioName, DemoScenarioConfig> = {
  mixed: {
    categories: {
      civilService: { status: 'Drift' },
      fiscal: { status: 'Warning' },
      executiveOversight: { status: 'Capture' },
      hatch: { status: 'Warning' },
      judicialIndependence: { status: 'Drift' },
      military: { status: 'Stable' },
      rulemaking: { status: 'Drift' },
      indices: { status: 'Warning' },
      infoAvailability: { status: 'Stable' },
    },
    intent: { overall: 'competitive_authoritarian', rhetoricScore: 0.8, actionScore: 1.2 },
    uptimeDownCount: 2,
  },
  stable: {
    categories: {
      civilService: { status: 'Stable' },
      fiscal: { status: 'Stable' },
      executiveOversight: { status: 'Warning' },
      hatch: { status: 'Stable' },
      judicialIndependence: { status: 'Stable' },
      military: { status: 'Stable' },
      rulemaking: { status: 'Warning' },
      indices: { status: 'Stable' },
      infoAvailability: { status: 'Stable' },
    },
    intent: { overall: 'liberal_democracy', rhetoricScore: -0.8, actionScore: -0.5 },
    uptimeDownCount: 0,
  },
  crisis: {
    categories: {
      civilService: { status: 'Capture' },
      fiscal: { status: 'Capture' },
      executiveOversight: { status: 'Capture' },
      hatch: { status: 'Drift' },
      judicialIndependence: { status: 'Capture' },
      military: { status: 'Drift' },
      rulemaking: { status: 'Capture' },
      indices: { status: 'Drift' },
      infoAvailability: { status: 'Drift' },
    },
    intent: { overall: 'personalist_rule', rhetoricScore: 1.8, actionScore: 1.9 },
    uptimeDownCount: 5,
  },
  degrading: {
    categories: {
      civilService: { status: 'Drift' },
      fiscal: { status: 'Drift' },
      executiveOversight: { status: 'Warning' },
      hatch: { status: 'Warning' },
      judicialIndependence: { status: 'Drift' },
      military: { status: 'Warning' },
      rulemaking: { status: 'Drift' },
      indices: { status: 'Warning' },
      infoAvailability: { status: 'Stable' },
    },
    intent: { overall: 'illiberal_democracy', rhetoricScore: 0.5, actionScore: 1.0 },
    uptimeDownCount: 1,
  },
};
