import type { InfrastructureTheme } from '@/lib/types/infrastructure';

export interface InfrastructureSuppressionRule {
  keyword: string;
  suppress_if_any: string[];
}

export interface InfrastructureThemeConfig {
  theme: InfrastructureTheme;
  label: string;
  description: string;
  /** Keywords that are always concerning regardless of context. */
  keywords: string[];
  /** Keywords that require context — suppressed if co-occurring terms appear. */
  contextDependentKeywords: string[];
  /** Suppression rules for context-dependent keywords. */
  suppressionRules: InfrastructureSuppressionRule[];
  activationThreshold: number;
}

/** Convenience getter: all keywords (always + context-dependent) for a theme. */
export function getAllKeywords(config: InfrastructureThemeConfig): string[] {
  return [...config.keywords, ...config.contextDependentKeywords];
}

export const INFRASTRUCTURE_THEMES: InfrastructureThemeConfig[] = [
  {
    theme: 'detention_incarceration',
    label: 'Detention & Incarceration',
    description:
      'Tracking expansion of detention capacity, facility construction, private prison contracts, and emergency detention infrastructure.',
    keywords: [
      'detention facility',
      'detention center',
      'detention capacity',
      'facility construction',
      'facility expansion',
      'CoreCivic',
      'GEO Group',
      'private prison',
      'emergency detention',
      'military detention',
      'tent city',
      'internment',
      'mass detention',
      'detention contract',
      'detention beds',
      'deportation flight',
      'removal flight',
      'family detention',
    ],
    contextDependentKeywords: [
      'ICE processing',
      'CBP processing',
      'immigration detention',
      'expedited removal',
      'removal proceedings',
      'holding facility',
      'temporary detention',
      'custody capacity',
      'bed space',
      'processing center',
      'detention facility award',
      'migrant facility',
    ],
    suppressionRules: [
      {
        keyword: 'expedited removal',
        suppress_if_any: ['court blocked', 'injunction', 'struck down', 'ruled unlawful'],
      },
      {
        keyword: 'removal proceedings',
        suppress_if_any: ['granted asylum', 'relief granted', 'case dismissed'],
      },
      {
        keyword: 'temporary detention',
        suppress_if_any: ['released', 'transferred to shelter', 'humanitarian parole'],
      },
    ],
    activationThreshold: 2,
  },
  {
    theme: 'surveillance_apparatus',
    label: 'Surveillance Apparatus',
    description:
      'Tracking expansion of surveillance capabilities including biometric databases, facial recognition, social media monitoring, and data collection.',
    keywords: [
      'biometric database',
      'biometric collection',
      'facial recognition',
      'social media monitoring',
      'social media surveillance',
      'cell-site simulator',
      'stingray',
      'bulk collection',
      'mass surveillance',
      'predictive policing',
      'surveillance contract',
      'surveillance technology',
      'geofence warrant',
      'tower dump',
      'electronic surveillance',
      'wiretap',
      'AI surveillance',
      'real-time tracking',
    ],
    contextDependentKeywords: [
      'data broker',
      'ALPR',
      'license plate reader',
      'phone tracking',
      'location data',
      'FISA',
      'section 702',
      'metadata collection',
      'data retention',
      'monitoring program',
      'intelligence sharing',
      'fusion center',
    ],
    suppressionRules: [
      {
        keyword: 'FISA',
        suppress_if_any: [
          'annual report',
          'compliance review',
          'reauthorization',
          'oversight report',
          'transparency report',
        ],
      },
      {
        keyword: 'section 702',
        suppress_if_any: ['reauthorization debate', 'reform proposal', 'compliance audit'],
      },
      {
        keyword: 'fusion center',
        suppress_if_any: ['audit', 'oversight review', 'privacy assessment'],
      },
      {
        keyword: 'data broker',
        suppress_if_any: ['regulation proposed', 'ban proposed', 'privacy bill'],
      },
    ],
    activationThreshold: 2,
  },
  {
    theme: 'criminalization_opposition',
    label: 'Criminalization of Opposition',
    description:
      'Tracking use of law enforcement and prosecution against political opposition, protesters, journalists, and advocacy organizations.',
    keywords: [
      'political prosecution',
      'selective prosecution',
      'domestic terrorist',
      'domestic terrorism designation',
      'protest criminalization',
      'material support charge',
      'seditious conspiracy',
      'insurrection charge',
      'targeting activists',
      'targeting protesters',
      'protest suppression',
      'dissent criminalized',
      'opposition investigated',
      'political opponent charged',
      'weaponized prosecution',
      'retaliatory investigation',
      'grand jury targeting',
      'subpoena targeting',
      'asset forfeiture political',
      'tax-exempt status revoked',
      'nonprofit investigation',
      'debanking',
      'financial penalty political',
      'enemy of the people',
      'designated organization',
      'watchlist political',
      'no-fly list political',
    ],
    contextDependentKeywords: ['RICO charge', 'conspiracy charge', 'enhanced penalties'],
    suppressionRules: [
      {
        keyword: 'RICO charge',
        suppress_if_any: [
          'drug trafficking',
          'organized crime',
          'fraud scheme',
          'money laundering',
          'racketeering enterprise',
        ],
      },
      {
        keyword: 'conspiracy charge',
        suppress_if_any: [
          'drug conspiracy',
          'wire fraud',
          'financial fraud',
          'tax evasion',
          'organized crime',
        ],
      },
      {
        keyword: 'enhanced penalties',
        suppress_if_any: ['drug offense', 'violent crime', 'repeat offender', 'gang related'],
      },
    ],
    activationThreshold: 2,
  },
];
