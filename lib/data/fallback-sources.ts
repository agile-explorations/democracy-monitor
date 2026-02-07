import type { FallbackSource } from '@/lib/types/resilience';

export interface FallbackConfig {
  category: string;
  sources: FallbackSource[];
}

export const FALLBACK_CONFIGS: FallbackConfig[] = [
  {
    category: 'oversight',
    sources: [
      { name: 'Oversight.gov', type: 'primary', url: 'https://www.oversight.gov/', parser: 'html' },
      {
        name: 'POGO (Project on Gov. Oversight)',
        type: 'watchdog',
        url: 'https://www.pogo.org/investigations',
        parser: 'html',
      },
      {
        name: 'Internet Archive - Oversight.gov',
        type: 'archive',
        url: 'https://web.archive.org/web/2024/https://www.oversight.gov/',
        parser: 'html',
      },
    ],
  },
  {
    category: 'fiscal',
    sources: [
      {
        name: 'GAO Reports',
        type: 'primary',
        url: 'https://www.gao.gov/rss/reports.xml',
        parser: 'rss',
      },
      {
        name: 'CBO Reports',
        type: 'watchdog',
        url: 'https://www.cbo.gov/topics/budget',
        parser: 'html',
      },
      {
        name: 'Internet Archive - GAO',
        type: 'archive',
        url: 'https://web.archive.org/web/2024/https://www.gao.gov/reports-testimonies',
        parser: 'html',
      },
    ],
  },
  {
    category: 'civil_service',
    sources: [
      {
        name: 'OPM Federal Register',
        type: 'primary',
        url: '/api/federal-register?agency=personnel-management-office',
        parser: 'json',
      },
      {
        name: 'Government Executive',
        type: 'watchdog',
        url: 'https://www.govexec.com/workforce/',
        parser: 'html',
      },
      {
        name: 'Internet Archive - OPM',
        type: 'archive',
        url: 'https://web.archive.org/web/2024/https://www.opm.gov/',
        parser: 'html',
      },
    ],
  },
  {
    category: 'judiciary',
    sources: [
      {
        name: 'Supreme Court Orders',
        type: 'primary',
        url: 'https://www.supremecourt.gov/rss/orders.xml',
        parser: 'rss',
      },
      {
        name: 'CourtListener',
        type: 'watchdog',
        url: 'https://www.courtlistener.com/',
        parser: 'html',
      },
      {
        name: 'Internet Archive - SCOTUS',
        type: 'archive',
        url: 'https://web.archive.org/web/2024/https://www.supremecourt.gov/',
        parser: 'html',
      },
    ],
  },
  {
    category: 'regulatory',
    sources: [
      {
        name: 'Federal Register API',
        type: 'primary',
        url: 'https://www.federalregister.gov/api/v1/documents.json',
        parser: 'json',
      },
      {
        name: 'Regulations.gov',
        type: 'watchdog',
        url: 'https://www.regulations.gov/',
        parser: 'html',
      },
      {
        name: 'Internet Archive - FR',
        type: 'archive',
        url: 'https://web.archive.org/web/2024/https://www.federalregister.gov/',
        parser: 'html',
      },
    ],
  },
];

export function getFallbackConfig(category: string): FallbackConfig | undefined {
  return FALLBACK_CONFIGS.find((c) => c.category === category);
}
