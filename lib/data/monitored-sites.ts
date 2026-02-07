import type { MonitoredSite } from '@/lib/types/resilience';

export const MONITORED_SITES: MonitoredSite[] = [
  {
    hostname: 'www.whitehouse.gov',
    name: 'White House',
    category: 'executive',
    critical: true,
  },
  {
    hostname: 'www.gao.gov',
    name: 'Government Accountability Office',
    category: 'oversight',
    critical: true,
    expectedContentPatterns: ['reports', 'decisions'],
  },
  {
    hostname: 'www.oversight.gov',
    name: 'Oversight.gov (IG Portal)',
    category: 'oversight',
    critical: true,
  },
  {
    hostname: 'www.federalregister.gov',
    name: 'Federal Register',
    category: 'regulatory',
    critical: true,
  },
  {
    hostname: 'www.supremecourt.gov',
    name: 'Supreme Court',
    category: 'judiciary',
    critical: true,
  },
  {
    hostname: 'www.uscourts.gov',
    name: 'U.S. Courts',
    category: 'judiciary',
    critical: true,
  },
  {
    hostname: 'www.justice.gov',
    name: 'Department of Justice',
    category: 'executive',
    critical: true,
  },
  {
    hostname: 'www.opm.gov',
    name: 'Office of Personnel Management',
    category: 'civil_service',
    critical: true,
  },
  {
    hostname: 'www.defense.gov',
    name: 'Department of Defense',
    category: 'military',
    critical: false,
  },
  {
    hostname: 'www.state.gov',
    name: 'Department of State',
    category: 'executive',
    critical: false,
  },
  {
    hostname: 'oig.ssa.gov',
    name: 'SSA Inspector General',
    category: 'oversight',
    critical: false,
  },
  {
    hostname: 'www.congress.gov',
    name: 'Congress.gov',
    category: 'legislative',
    critical: true,
  },
  {
    hostname: 'www.cbo.gov',
    name: 'Congressional Budget Office',
    category: 'fiscal',
    critical: false,
  },
  {
    hostname: 'www.treasury.gov',
    name: 'Department of Treasury',
    category: 'fiscal',
    critical: false,
  },
  {
    hostname: 'www.usa.gov',
    name: 'USA.gov',
    category: 'public_access',
    critical: true,
  },
];
