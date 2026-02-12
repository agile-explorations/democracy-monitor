import type { ValidationSource } from '@/lib/types/validation';

/**
 * Maps external index dimensions to internal dashboard categories.
 */
export const DIMENSION_TO_CATEGORY: Record<string, string> = {
  liberal_democracy: 'executiveActions',
  rule_of_law: 'courts',
  civil_liberties: 'elections',
  media_freedom: 'mediaFreedom',
  government_accountability: 'igs',
  executive_constraints: 'fiscal',
  civil_service_independence: 'civilService',
};

/**
 * Static metadata for each external validation source.
 */
export const SOURCE_METADATA: Record<
  ValidationSource,
  {
    name: string;
    url: string;
    frequency: string;
    scaleDescription: string;
  }
> = {
  'v-dem': {
    name: 'Varieties of Democracy (V-Dem)',
    url: 'https://www.v-dem.net/',
    frequency: 'Annual',
    scaleDescription: '0-1 continuous index (higher = more democratic)',
  },
  'freedom-house': {
    name: 'Freedom House — Freedom in the World',
    url: 'https://freedomhouse.org/report/freedom-world',
    frequency: 'Annual',
    scaleDescription: '0-100 aggregate score (higher = more free)',
  },
  'bright-line-watch': {
    name: 'Bright Line Watch',
    url: 'https://brightlinewatch.org/',
    frequency: 'Quarterly',
    scaleDescription: '0-1 expert survey mean (higher = more democratic)',
  },
};
