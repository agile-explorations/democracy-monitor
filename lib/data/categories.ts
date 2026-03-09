import type { Category, Signal } from '@/lib/types';
import { scotusTermYear } from '@/lib/utils/date-utils';

export const CATEGORIES: Category[] = [
  {
    key: 'civilService',
    title: 'Government Worker Protections',
    description:
      "Are career government workers protected from being fired for political reasons? 'Schedule F' is a rule that could let the President fire thousands of workers who aren't loyal to him.",
    expertDescription:
      'Merit-system protections insulate the federal workforce from political patronage. Reclassification of career positions (e.g., Schedule F) or mass reductions in force can hollow out institutional expertise and create loyalty-based staffing, undermining bureaucratic independence that constrains executive overreach.',
    signals: [
      {
        id: 'fr_opm',
        name: 'Office of Personnel Management (OPM)',
        url: '/api/federal-register?agency=personnel-management-office',
        type: 'federal_register',
        note: 'The office that makes rules about government jobs',
        health: {
          isCanary: true,
          expectedFrequency: 'daily',
          maxSilentDays: 3,
          expectedMinWeeklyDocs: 20,
        },
      },
      {
        id: 'fr_schedule_f',
        name: 'Schedule F Rules Search',
        url: '/api/federal-register?term=%22schedule+f%22',
        type: 'federal_register',
        note: 'Looking for rules that could let the President fire career workers',
      },
      {
        id: 'fr_presdoc_civilservice',
        name: 'Presidential Documents — Civil Service',
        url: '/api/federal-register?type=PRESDOCU&term=workforce+|+personnel+|+%22civil+service%22+|+restructuring+|+%22government+employee%22',
        type: 'federal_register',
        note: 'Executive orders and memoranda affecting the federal workforce',
      },
      {
        id: 'fr_workforce',
        name: 'Federal Workforce Actions',
        url: '/api/federal-register?term=%22reduction+in+force%22+|+%22federal+workforce%22+|+%22government+employee%22+|+%22personnel+management%22',
        type: 'federal_register',
        note: 'Operational workforce actions including RIFs and personnel changes',
      },
      {
        id: 'fr_restructuring',
        name: 'Agency Restructuring',
        url: '/api/federal-register?term=restructuring+|+reorganization+|+%22workforce+reshaping%22+|+%22agency+realignment%22',
        type: 'federal_register',
        note: 'Structural changes to federal agencies and workforce',
      },
    ],
  },
  {
    key: 'fiscal',
    title: 'Spending Money Congress Approved',
    description:
      'Can the President refuse to spend money that Congress already approved? This is called "impoundment" and it\'s usually illegal.',
    expertDescription:
      "The Impoundment Control Act of 1974 prohibits the executive from unilaterally withholding congressionally appropriated funds. Circumventing this — through rescission, deferral, or spending freezes — undermines Congress's constitutional power of the purse, a foundational check on executive authority.",
    signals: [
      {
        id: 'fr_impoundment',
        name: 'Impoundment & Rescission',
        url: '/api/federal-register?term=impoundment+|+rescission+|+deferral+|+withholding+|+appropriation',
        type: 'federal_register',
        note: 'Executive actions to delay or block congressionally approved spending',
      },
      {
        id: 'fr_anti_deficiency',
        name: 'Anti-Deficiency & Spending Authority',
        url: '/api/federal-register?term=%22anti-deficiency%22+|+apportionment+|+obligation+|+sequestration+|+impound',
        type: 'federal_register',
        note: 'Legal compliance with congressional spending authority',
      },
      {
        id: 'fr_presdoc_fiscal',
        name: 'Presidential Documents — Fiscal',
        url: '/api/federal-register?type=PRESDOCU&term=appropriation+|+spending+|+budget+|+impoundment+|+rescission+|+funding',
        type: 'federal_register',
        note: 'Executive orders and memoranda affecting federal spending',
      },
      {
        id: 'fr_spending',
        name: 'Spending Actions',
        url: '/api/federal-register?term=%22spending+freeze%22+|+%22funding+pause%22+|+%22program+termination%22+|+%22agency+closure%22+|+%22grant+suspension%22',
        type: 'federal_register',
        note: 'Operational fiscal actions including freezes, pauses, and suspensions',
      },
    ],
  },
  {
    key: 'executiveOversight',
    title: 'Government Watchdogs (Inspectors General)',
    description:
      'Inspectors General (IGs) are like detectives who check if government agencies are doing their jobs correctly. Can they do their work without being fired or blocked?',
    expertDescription:
      'Inspectors General provide independent oversight of executive agencies, with statutory protections against removal. Mass IG firings, vacancy manipulation, or resource cuts degrade the internal accountability infrastructure that deters waste, fraud, and abuse of power across the federal government.',
    signals: [
      {
        id: 'html_oversight_gov',
        name: 'Oversight.gov (IG Reports)',
        url: 'https://www.oversight.gov/',
        type: 'html',
        note: 'The main website for all government watchdog reports — Inspector General audits, investigations, and recommendations.',
      },
      {
        id: 'oig_ssa',
        name: 'SSA Inspector General',
        url: 'oig://ssa',
        type: 'oig_html',
        note: 'SSA OIG audit reports via HTML scraping (oig.ssa.gov)',
        health: {
          isCanary: false,
          expectedFrequency: 'weekly',
          maxSilentDays: 14,
          expectedMinWeeklyDocs: 2,
        },
      },
      {
        id: 'fr_inspector_general',
        name: 'Inspector General Activity',
        url: '/api/federal-register?term=%22inspector+general%22',
        type: 'federal_register',
        note: 'Federal Register documents mentioning Inspector General activities',
      },
      {
        id: 'fr_oversight',
        name: 'Oversight & Accountability',
        url: '/api/federal-register?term=oversight+|+accountability+|+watchdog',
        type: 'federal_register',
        note: 'Broader oversight and accountability documents',
      },
      {
        id: 'fr_presdoc_oversight',
        name: 'Presidential Documents — Oversight',
        url: '/api/federal-register?type=PRESDOCU&term=%22inspector+general%22+|+oversight+|+accountability+|+watchdog',
        type: 'federal_register',
        note: 'Executive orders and memoranda affecting government oversight',
      },
      {
        id: 'fr_ig_personnel',
        name: 'IG Personnel Changes',
        url: '/api/federal-register?term=%22inspector+general%22+(removal+|+vacancy+|+acting+|+appointment)',
        type: 'federal_register',
        note: 'Inspector General removals, vacancies, and appointments',
      },
      {
        id: 'gi_congressional_reports',
        name: 'Congressional Reports (GovInfo)',
        url: 'govinfo://collection?collection=CRPT',
        type: 'govinfo',
        note: 'Congressional oversight and committee reports via GovInfo API',
        health: {
          isCanary: false,
          expectedFrequency: 'weekly',
          maxSilentDays: 14,
          expectedMinWeeklyDocs: 3,
        },
      },
      {
        id: 'oig_hhs',
        name: 'HHS Inspector General',
        url: 'oig://hhs',
        type: 'oig_html',
        note: 'HHS OIG reports via HTML scraping (oig.hhs.gov)',
        health: {
          isCanary: false,
          expectedFrequency: 'weekly',
          maxSilentDays: 14,
          expectedMinWeeklyDocs: 1,
        },
      },
      {
        id: 'oig_doj',
        name: 'DOJ Inspector General',
        url: 'oig://doj',
        type: 'oig_html',
        note: 'DOJ OIG reports via HTML scraping (oig.justice.gov)',
        health: {
          isCanary: false,
          expectedFrequency: 'weekly',
          maxSilentDays: 14,
          expectedMinWeeklyDocs: 1,
        },
      },
    ],
  },
  {
    key: 'hatch',
    title: 'Keeping Politics Out of Government',
    description:
      'Government workers should serve all Americans, not just one political party. The Hatch Act is a law that stops them from campaigning while at work.',
    expertDescription:
      'The Hatch Act creates a firewall between partisan politics and federal administration. When enforcement weakens or violations go unpunished, the civil service risks becoming an extension of party apparatus — eroding public trust in government neutrality and the nonpartisan delivery of services.',
    signals: [
      {
        id: 'fr_hatch_act',
        name: 'Hatch Act News',
        url: '/api/federal-register?term=%22hatch+act%22',
        type: 'federal_register',
        note: 'Reports about government workers breaking the rule against campaigning',
      },
      {
        id: 'fr_special_counsel',
        name: 'Special Counsel Office',
        url: '/api/federal-register?agency=special-counsel-office',
        type: 'federal_register',
        note: 'The office that investigates Hatch Act violations',
      },
    ],
  },
  {
    key: 'judicialIndependence',
    title: 'Following Court Orders',
    description:
      'When a judge orders the government to do something (or stop doing something), does the President follow those orders? This is a key part of our system of checks and balances.',
    expertDescription:
      "Judicial independence is the cornerstone of constitutional governance. Executive non-compliance with court orders, attempts to restructure court jurisdiction, or politicized judicial appointments erode the judiciary's ability to serve as a check on executive and legislative power.",
    signals: [
      {
        id: 'rss_scotus',
        name: 'Supreme Court Opinions',
        url: `https://www.supremecourt.gov/rss/slipopinion_rss.aspx?TYear=${scotusTermYear()}`,
        type: 'rss',
        note: 'Opinions from the highest court in America',
        health: {
          isCanary: false,
          expectedFrequency: 'weekly_during_term',
          maxSilentDays: 14,
          expectedMinWeeklyDocs: 0,
        },
      },
      {
        id: 'fr_court_compliance',
        name: 'Court Compliance Reports',
        url: '/api/federal-register?term=injunction+compliance',
        type: 'federal_register',
        note: 'Looking for reports about following (or not following) court orders',
      },
      {
        id: 'fr_judicial_nominations',
        name: 'Judicial Nominations',
        url: '/api/federal-register?term=%22judicial+nomination%22+|+%22judicial+appointment%22',
        type: 'federal_register',
        note: 'Tracking judicial nominations and appointments',
      },
      {
        id: 'fr_court_structure',
        name: 'Court Structure Changes',
        url: '/api/federal-register?term=%22court+jurisdiction%22+|+%22judicial+reform%22',
        type: 'federal_register',
        note: 'Changes to court jurisdiction or judicial reform proposals',
      },
      {
        id: 'fr_presdoc_courts',
        name: 'Presidential Documents — Courts',
        url: '/api/federal-register?type=PRESDOCU&term=judicial+|+court+|+jurisdiction+|+%22judge+nomination%22',
        type: 'federal_register',
        note: 'Executive orders and memoranda affecting the judiciary',
      },
    ],
  },
  {
    key: 'military',
    title: 'Using Military Inside the U.S.',
    description:
      'The military is supposed to fight foreign enemies, not police American citizens. There are strict laws about when troops can be used inside the U.S.',
    expertDescription:
      'The Posse Comitatus Act and Insurrection Act define narrow boundaries for domestic military deployment. Expansion of emergency powers, invocation of IEEPA for domestic purposes, or National Guard deployments beyond traditional scope signal militarization of civilian governance.',
    signals: [
      {
        id: 'rss_dod_news',
        name: 'Department of Defense News',
        url: 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=1&Site=945',
        type: 'rss',
        note: 'Official news from the Pentagon (aka "Department of War" per current admin branding)',
        health: {
          isCanary: true,
          expectedFrequency: 'daily',
          maxSilentDays: 3,
          expectedMinWeeklyDocs: 5,
        },
      },
      {
        id: 'rss_dod_contracts',
        name: 'Military Contracts',
        url: 'https://www.defense.gov/DesktopModules/ArticleCS/RSS.ashx?ContentType=9&Site=945',
        type: 'rss',
        note: 'What the military is buying (can show unusual activity)',
      },
      {
        id: 'fr_national_emergency',
        name: 'National Emergency Declarations',
        url: '/api/federal-register?term=%22national+emergency%22',
        type: 'federal_register',
        note: 'National emergency declarations, IEEPA, and related executive emergency actions',
      },
      {
        id: 'fr_national_guard',
        name: 'National Guard & Domestic Deployment',
        url: '/api/federal-register?term=%22national+guard%22+deployment',
        type: 'federal_register',
        note: 'National Guard mobilizations and domestic military deployment orders',
      },
      {
        id: 'fr_presdoc_military',
        name: 'Presidential Documents — Military',
        url: '/api/federal-register?type=PRESDOCU&term=%22national+emergency%22+|+military+|+defense+|+%22national+guard%22+|+insurrection+|+IEEPA',
        type: 'federal_register',
        note: 'Executive orders and memoranda involving military or emergency powers',
      },
      {
        id: 'fr_dod',
        name: 'DoD / Dept of War Federal Register',
        url: '/api/federal-register?agency=defense-department',
        type: 'federal_register',
        note: 'All Federal Register activity from DoD (legally still "Department of Defense")',
        health: {
          isCanary: true,
          expectedFrequency: 'daily',
          maxSilentDays: 3,
          expectedMinWeeklyDocs: 20,
        },
      },
    ],
  },
  {
    key: 'rulemaking',
    title: 'Independent Agency Rules',
    description:
      'Some government agencies (like the FDA or EPA) are supposed to make decisions based on science and law, not politics. Can the President control what rules they write?',
    expertDescription:
      "Independent agencies derive authority from statutory mandates, not executive direction. Centralized regulatory review (e.g., OIRA clearance of independent agency rules) or executive orders overriding agency expertise undermine the administrative state's capacity for evidence-based policymaking.",
    signals: [
      {
        id: 'fr_exec_regulatory',
        name: 'Executive Regulatory Control',
        url: '/api/federal-register?term=%22executive+order%22+|+%22regulatory+review%22+|+%22independent+agency%22',
        type: 'federal_register',
        note: 'Executive interventions in independent agency rulemaking',
      },
      {
        id: 'fr_oira',
        name: 'OIRA Regulatory Review',
        url: '/api/federal-register?term=oira+|+%22regulatory+review%22+|+%22regulatory+clearance%22+|+%22executive+oversight%22',
        type: 'federal_register',
        note: 'White House regulatory review and centralized control',
      },
      {
        id: 'fr_presdoc_rulemaking',
        name: 'Presidential Documents — Rulemaking',
        url: '/api/federal-register?type=PRESDOCU&term=regulatory+|+rulemaking+|+deregulation+|+%22independent+agency%22',
        type: 'federal_register',
        note: 'Executive orders and memoranda affecting independent agency rulemaking',
      },
    ],
  },
  {
    key: 'executiveActions',
    title: 'Executive Action Volume',
    description:
      'Tracking the volume and pace of presidential actions and new regulations. High activity may indicate rapid expansion of executive authority.',
    expertDescription:
      'The rate and scope of executive orders, memoranda, and rulemaking serve as a structural indicator of executive assertiveness. Abnormal volume spikes — especially paired with procedural shortcuts like interim final rules — can signal an effort to entrench policy before institutional pushback materializes.',
    signals: [
      {
        id: 'fr_presidential_actions',
        name: 'Presidential Actions',
        url: '/api/federal-register?type=PRESDOCU',
        type: 'federal_register',
        note: 'Executive orders and other actions by the President',
        health: {
          isCanary: true,
          expectedFrequency: 'daily',
          maxSilentDays: 3,
          expectedMinWeeklyDocs: 10,
        },
      },
      {
        id: 'fr_all_rules',
        name: 'All New Regulations',
        url: '/api/federal-register?type=RULE',
        type: 'federal_register',
        note: 'All new rules from government agencies',
        health: {
          isCanary: true,
          expectedFrequency: 'daily',
          maxSilentDays: 3,
          expectedMinWeeklyDocs: 20,
        },
      },
    ],
  },
  {
    key: 'infoAvailability',
    title: 'Information Availability',
    description:
      'Are government websites, reports, and data still publicly accessible? Tracks whether critical transparency infrastructure is online and whether expected reports are being published.',
    expertDescription:
      "Public access to government data, FOIA compliance, and publication of mandated reports form the transparency infrastructure that enables democratic accountability. Removal of datasets, website takedowns, or suppression of required disclosures reduces the public's ability to monitor government conduct.",
    signals: [
      {
        id: 'json_uptime',
        name: 'Government Site Uptime',
        url: '/api/uptime/status',
        type: 'json',
        note: 'Monitoring whether key government websites are accessible',
      },
      {
        id: 'rss_gao',
        name: 'GAO Reports (Availability)',
        url: 'https://www.gao.gov/rss/reports.xml',
        type: 'rss',
        note: 'Checking if GAO continues publishing oversight reports',
        health: {
          isCanary: true,
          expectedFrequency: 'weekly',
          maxSilentDays: 14,
          expectedMinWeeklyDocs: 2,
        },
      },
      {
        id: 'fr_foia',
        name: 'FOIA & Transparency Rules',
        url: '/api/federal-register?term=%22freedom+of+information%22+|+FOIA+|+transparency+|+disclosure',
        type: 'federal_register',
        note: 'FOIA-related Federal Register documents',
      },
      {
        id: 'fr_open_data',
        name: 'Public Records & Data Access',
        url: '/api/federal-register?term=%22open+government%22+|+%22data+access%22+|+%22public+records%22',
        type: 'federal_register',
        note: 'Open government and data access documents',
      },
    ],
  },
  {
    key: 'elections',
    title: 'Free and Fair Elections',
    description:
      'Are elections being administered fairly and without interference? Tracks changes to election infrastructure, voter access, and election administration independence.',
    expertDescription:
      'Free and fair elections require independent administration, equitable ballot access, and transparent campaign finance. Federal actions that alter voter eligibility rules, defund election security, weaken FEC enforcement, or challenge certification processes threaten the foundational mechanism of democratic legitimacy.',
    signals: [
      {
        id: 'fr_election_integrity',
        name: 'Election Integrity & Interference',
        url: '/api/federal-register?term=%22election+integrity%22+|+%22election+interference%22+|+%22voting+rights%22+|+%22ballot+access%22',
        type: 'federal_register',
        note: 'Federal actions affecting election integrity and voter access',
      },
      {
        id: 'fr_election_admin',
        name: 'Election Administration Changes',
        url: '/api/federal-register?term=%22election+commission%22+|+%22election+certification%22+|+recount+|+%22polling+place%22',
        type: 'federal_register',
        note: 'Changes to election administration and oversight',
      },
      {
        id: 'fec_advisory_opinions',
        name: 'FEC Advisory Opinions',
        url: 'fec://advisory-opinions?type=advisory_opinions',
        type: 'fec_json',
        note: 'FEC advisory opinions on campaign finance law (~1-2/week)',
      },
      {
        id: 'fec_enforcement',
        name: 'FEC Enforcement (MURs)',
        url: 'fec://enforcement?type=murs',
        type: 'fec_json',
        note: 'FEC Matters Under Review — enforcement actions and commissioner deadlock tracking (~2-4/week)',
      },
    ],
  },
  {
    key: 'mediaFreedom',
    title: 'Press Freedom',
    description:
      'Can journalists report freely without government interference? Tracks press access, FOIA compliance, and threats to independent media.',
    expertDescription:
      "Press freedom is a prerequisite for informed public participation in democracy. Restricting press credentials, retaliating against outlets, weakening FOIA, or using FCC licensing as political leverage degrades the fourth estate's watchdog function over government power.",
    signals: [
      {
        id: 'fr_press_foia',
        name: 'Press & FOIA Rules',
        url: '/api/federal-register?term=%22freedom+of+information%22+|+%22press+credentials%22',
        type: 'federal_register',
        note: 'Rules about press access and freedom of information',
      },
      {
        id: 'fr_foia_compliance',
        name: 'FOIA Compliance',
        url: '/api/federal-register?term=FOIA+|+%22FOIA+compliance%22+|+%22public+records%22',
        type: 'federal_register',
        note: 'Rules about government transparency and public records access',
      },
      {
        id: 'rss_fcc_media',
        name: 'FCC Media Bureau',
        url: 'https://www.fcc.gov/news-events/rss-feeds/media-bureau',
        type: 'rss',
        note: 'FCC Media Bureau actions on broadcast licensing, ownership, and enforcement',
        health: {
          isCanary: false,
          expectedFrequency: 'weekly',
          maxSilentDays: 14,
          expectedMinWeeklyDocs: 2,
        },
      },
      {
        id: 'rss_fcc_enforcement',
        name: 'FCC Enforcement Bureau',
        url: 'https://www.fcc.gov/news-events/rss-feeds/enforcement-bureau',
        type: 'rss',
        note: 'FCC Enforcement Bureau actions relevant to media regulation',
      },
    ],
  },
  {
    key: 'lawEnforcement',
    title: 'Federal Law Enforcement',
    description:
      'Is federal law enforcement being used selectively or politically? Tracks DOJ prosecution patterns, enforcement priorities, and potential politicization of the justice system.',
    expertDescription:
      'Independent prosecutorial discretion is central to rule of law. Politicized DOJ priorities — selective prosecution of political opponents, dropped investigations of allies, or retaliation against career prosecutors — transform law enforcement from a neutral institution into an instrument of political power.',
    signals: [
      {
        id: 'cl_enforcement_cases',
        name: 'CourtListener: Enforcement Challenges',
        url: 'courtlistener://recap?nos=440,530,890',
        type: 'courtlistener',
        note: 'Federal cases involving selective prosecution, civil rights, and habeas corpus',
      },
      {
        id: 'doj_criminal',
        name: 'DOJ Criminal Division Releases',
        url: 'doj://press?component=criminal-division',
        type: 'doj_json',
        note: 'Press releases from the DOJ Criminal Division',
      },
      {
        id: 'doj_civil_rights',
        name: 'DOJ Civil Rights Division Releases',
        url: 'doj://press?component=civil-rights-division',
        type: 'doj_json',
        note: 'Press releases from the DOJ Civil Rights Division',
      },
      {
        id: 'doj_national_security',
        name: 'DOJ National Security Division Releases',
        url: 'doj://press?component=national-security-division',
        type: 'doj_json',
        note: 'Press releases from the DOJ National Security Division',
      },
      {
        id: 'fr_doj',
        name: 'DOJ Federal Register Documents',
        url: '/api/federal-register?agency=justice-department',
        type: 'federal_register',
        note: 'Federal Register documents from the Department of Justice',
      },
    ],
  },
  {
    key: 'civilLiberties',
    title: 'Civil Rights & Liberties',
    description:
      'Government actions that reduce civil liberties protections. Tracks policies restricting constitutional rights, rulings narrowing due process or equal protection, expansion of surveillance or detention authority, and termination of civil rights consent decrees.',
    expertDescription:
      'Constitutional rights — due process, equal protection, habeas corpus, and First Amendment freedoms — define the boundary between state power and individual liberty. Erosion of these protections through executive action, consent decree termination, or expanded surveillance authority signals democratic backsliding at its most fundamental level.',
    signals: [
      {
        id: 'cl_civil_rights',
        name: 'CourtListener: Civil Rights Cases',
        url: 'courtlistener://recap?nos=440',
        type: 'courtlistener',
        note: 'Federal civil rights cases (NOS 440)',
      },
      {
        id: 'cl_first_amendment',
        name: 'CourtListener: First Amendment',
        url: 'courtlistener://recap?q=%22first+amendment%22+AND+(violation+OR+injunction+OR+challenge+OR+retaliation+OR+%22free+speech%22+OR+%22free+press%22)',
        type: 'courtlistener',
        note: 'First Amendment challenges in federal court',
      },
      {
        id: 'cl_habeas',
        name: 'CourtListener: Habeas Corpus',
        url: 'courtlistener://recap?nos=530',
        type: 'courtlistener',
        note: 'Habeas corpus petitions (NOS 530)',
      },
      {
        id: 'doj_crd',
        name: 'DOJ Civil Rights Division',
        url: 'doj://press?component=civil-rights-division',
        type: 'doj_json',
        note: 'DOJ Civil Rights Division press releases',
      },
      {
        id: 'fr_civil_rights',
        name: 'Civil Rights FR Documents',
        url: '/api/federal-register?term=%22civil+rights%22+|+%22due+process%22+|+%22equal+protection%22',
        type: 'federal_register',
        note: 'Federal Register documents on civil rights and due process',
      },
    ],
  },
  {
    key: 'immigrationEnforcement',
    title: 'Immigration Enforcement',
    description:
      'How is immigration enforcement changing? Tracks detention, removal, asylum restrictions, and enforcement apparatus patterns through DHS and CBP actions.',
    expertDescription:
      'Immigration enforcement often serves as a leading indicator of broader institutional norm erosion. Expansion of expedited removal, mass detention without due process, and deployment of enforcement infrastructure beyond traditional immigration contexts can normalize executive overreach that later extends to other domains.',
    signals: [
      {
        id: 'fr_dhs_immigration',
        name: 'Federal Register: DHS Immigration',
        url: '/api/federal-register?agency=homeland-security-department&term=asylum+|+TPS+|+deportation+|+detention+|+removal+|+immigration+|+%22public+charge%22',
        type: 'federal_register',
        note: 'DHS immigration-related Federal Register documents',
      },
      {
        id: 'fr_cbp_enforcement',
        name: 'Federal Register: CBP Enforcement',
        url: '/api/federal-register?agency=u-s-customs-and-border-protection&term=detention+|+removal+|+deportation+|+%22expedited+removal%22+|+%22border+wall%22+|+apprehension+|+enforcement',
        type: 'federal_register',
        note: 'CBP enforcement-related Federal Register documents',
      },
    ],
  },
];

/** Flat lookup from signal ID to Signal + category key. */
export function buildSignalLookup(): Map<string, { signal: Signal; categoryKey: string }> {
  const map = new Map<string, { signal: Signal; categoryKey: string }>();
  for (const cat of CATEGORIES) {
    for (const signal of cat.signals) {
      map.set(signal.id, { signal, categoryKey: cat.key });
    }
  }
  return map;
}
