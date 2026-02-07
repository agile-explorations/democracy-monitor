import type { ExpectedReport } from '@/lib/types/resilience';

export const EXPECTED_REPORTS: ExpectedReport[] = [
  {
    name: 'GAO Monthly Report Summary',
    agency: 'Government Accountability Office',
    frequency: 'monthly',
    url: 'https://www.gao.gov/reports-testimonies',
  },
  {
    name: 'Federal Register Daily Publication',
    agency: 'National Archives',
    frequency: 'daily',
    url: 'https://www.federalregister.gov/documents/current',
  },
  {
    name: 'Supreme Court Order List',
    agency: 'Supreme Court',
    frequency: 'weekly',
    url: 'https://www.supremecourt.gov/orders/ordersofthecourt',
  },
  {
    name: 'OPM Federal Workforce Statistics',
    agency: 'Office of Personnel Management',
    frequency: 'quarterly',
    url: 'https://www.opm.gov/policy-data-oversight/data-analysis-documentation/federal-employment-reports/',
  },
  {
    name: 'Treasury Monthly Statement',
    agency: 'Department of Treasury',
    frequency: 'monthly',
    url: 'https://fiscal.treasury.gov/reports-statements/mts/',
  },
  {
    name: 'CBO Budget Outlook',
    agency: 'Congressional Budget Office',
    frequency: 'annual',
    url: 'https://www.cbo.gov/topics/budget',
  },
  {
    name: 'IG Semiannual Reports to Congress',
    agency: 'Various Inspectors General',
    frequency: 'quarterly',
    url: 'https://www.oversight.gov/',
  },
];
