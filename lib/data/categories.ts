import type { Category } from '@/lib/types';

export const CATEGORIES: Category[] = [
  {
    key: 'civilService',
    title: 'Government Worker Protections',
    description: "Are career government workers protected from being fired for political reasons? 'Schedule F' is a rule that could let the President fire thousands of workers who aren't loyal to him.",
    signals: [
      { name: 'Office of Personnel Management (OPM)', url: '/api/federal-register?agency=personnel-management-office', type: 'federal_register', note: 'The office that makes rules about government jobs' },
      { name: 'Schedule F Rules Search', url: '/api/federal-register?term=schedule+f+civil+service', type: 'federal_register', note: 'Looking for rules that could let the President fire career workers' }
    ]
  },
  {
    key: 'fiscal',
    title: 'Spending Money Congress Approved',
    description: 'Can the President refuse to spend money that Congress already approved? This is called "impoundment" and it\'s usually illegal.',
    signals: [
      { name: 'GAO Reports (Government Watchdog)', url: 'https://www.gao.gov/rss/reports.xml', type: 'rss', note: 'GAO checks if the government is following money rules' },
      { name: 'Impoundment News', url: '/api/federal-register?term=impoundment', type: 'federal_register', note: 'Reports about the President refusing to spend approved money' }
    ]
  },
  {
    key: 'igs',
    title: 'Government Watchdogs (Inspectors General)',
    description: 'Inspectors General (IGs) are like detectives who check if government agencies are doing their jobs correctly. Can they do their work without being fired or blocked?',
    signals: [
      { name: '⚠️ Oversight.gov - CURRENTLY DOWN', url: 'https://www.oversight.gov/', type: 'html', note: 'IMPORTANT: The main website for all government watchdog reports shut down in October 2025 because its funding was blocked.' },
      { name: 'Social Security Watchdog', url: 'https://oig.ssa.gov/feed.xml', type: 'rss', note: 'Reports from the Social Security Inspector General (still working)' }
    ]
  },
  {
    key: 'hatch',
    title: 'Keeping Politics Out of Government',
    description: 'Government workers should serve all Americans, not just one political party. The Hatch Act is a law that stops them from campaigning while at work.',
    signals: [
      { name: 'Hatch Act News', url: '/api/federal-register?term=hatch+act', type: 'federal_register', note: 'Reports about government workers breaking the rule against campaigning' },
      { name: 'Special Counsel Office', url: '/api/federal-register?agency=special-counsel-office', type: 'federal_register', note: 'The office that investigates Hatch Act violations' }
    ]
  },
  {
    key: 'courts',
    title: 'Following Court Orders',
    description: 'When a judge orders the government to do something (or stop doing something), does the President follow those orders? This is a key part of our system of checks and balances.',
    signals: [
      { name: 'Supreme Court Orders', url: 'https://www.supremecourt.gov/rss/orders.xml', type: 'rss', note: 'Orders from the highest court in America' },
      { name: 'Court Compliance Reports', url: '/api/federal-register?term=injunction+compliance', type: 'federal_register', note: 'Looking for reports about following (or not following) court orders' }
    ]
  },
  {
    key: 'military',
    title: 'Using Military Inside the U.S.',
    description: 'The military is supposed to fight foreign enemies, not police American citizens. There are strict laws about when troops can be used inside the U.S.',
    signals: [
      { name: 'Department of Defense News', url: 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945', type: 'rss', note: 'Official news from the Pentagon' },
      { name: 'Military Contracts', url: 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=9&Site=945', type: 'rss', note: 'What the military is buying (can show unusual activity)' }
    ]
  },
  {
    key: 'rulemaking',
    title: 'Independent Agency Rules',
    description: 'Some government agencies (like the FDA or EPA) are supposed to make decisions based on science and law, not politics. Can the President control what rules they write?',
    signals: [
      { name: 'New Government Rules', url: '/api/federal-register?type=RULE', type: 'federal_register', note: 'Rules that agencies just published' },
      { name: 'Proposed Government Rules', url: '/api/federal-register?type=PRORULE', type: 'federal_register', note: 'Rules that agencies want to create' }
    ]
  },
  {
    key: 'indices',
    title: 'Overall Democracy Health',
    description: 'Looking at the big picture: Are democratic institutions getting stronger or weaker? This tracks overall government activity.',
    signals: [
      { name: 'Presidential Actions', url: '/api/federal-register?type=PRESDOCU', type: 'federal_register', note: 'Executive orders and other actions by the President' },
      { name: 'All New Regulations', url: '/api/federal-register?type=RULE', type: 'federal_register', note: 'All new rules from government agencies' }
    ]
  },
  {
    key: 'infoAvailability',
    title: 'Information Availability',
    description: 'Are government websites, reports, and data still publicly accessible? Tracks whether critical transparency infrastructure is online and whether expected reports are being published.',
    signals: [
      { name: 'Government Site Uptime', url: '/api/uptime/status', type: 'json', note: 'Monitoring whether key government websites are accessible' },
      { name: 'GAO Reports (Availability)', url: 'https://www.gao.gov/rss/reports.xml', type: 'rss', note: 'Checking if GAO continues publishing oversight reports' }
    ]
  }
];
