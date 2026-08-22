import type { Category, Signal } from '@/lib/types';

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
        url: '/api/federal-register?term=%22schedule+f%22&agency=personnel-management-office,executive-office-of-the-president',
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
        url: '/api/federal-register?term=%22reduction+in+force%22+|+%22federal+workforce%22+|+%22government+employee%22+|+%22personnel+management%22&agency=personnel-management-office,executive-office-of-the-president,management-and-budget-office',
        type: 'federal_register',
        note: 'Operational workforce actions including RIFs and personnel changes',
      },
      {
        id: 'fr_restructuring',
        name: 'Agency Restructuring',
        url: '/api/federal-register?term=restructuring+|+reorganization+|+%22workforce+reshaping%22+|+%22agency+realignment%22&agency=personnel-management-office,executive-office-of-the-president,management-and-budget-office,general-services-administration',
        type: 'federal_register',
        note: 'Structural changes to federal agencies and workforce',
      },
      {
        id: 'oig_oversight_opm',
        name: 'OPM Inspector General',
        url: 'oig://oversight?oigs=283',
        type: 'oig_html',
        note: 'OPM OIG reports via the Oversight.gov (CIGIE) aggregator; coverage depends on OIG self-submission to CIGIE',
        health: {
          isCanary: false,
          expectedFrequency: 'weekly',
          // OPM OIG publishes ~0.5 reports/week (38 reports over the ~80-week
          // current term, measured 2026-08-01).
          maxSilentDays: 45,
          expectedMinWeeklyDocs: 1,
        },
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
        url: '/api/federal-register?term=impoundment+|+rescission+|+deferral+|+withholding+|+appropriation&agency=management-and-budget-office,executive-office-of-the-president,treasury-department',
        type: 'federal_register',
        note: 'Executive actions to delay or block congressionally approved spending',
      },
      {
        id: 'fr_anti_deficiency',
        name: 'Anti-Deficiency & Spending Authority',
        url: '/api/federal-register?term=%22anti-deficiency%22+|+apportionment+|+obligation+|+sequestration+|+impound&agency=management-and-budget-office,executive-office-of-the-president,treasury-department',
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
        url: '/api/federal-register?term=%22spending+freeze%22+|+%22funding+pause%22+|+%22program+termination%22+|+%22agency+closure%22+|+%22grant+suspension%22&agency=management-and-budget-office,executive-office-of-the-president,treasury-department',
        type: 'federal_register',
        note: 'Operational fiscal actions including freezes, pauses, and suspensions',
      },
      {
        id: 'oig_oversight_fiscal',
        name: 'Treasury & TIGTA Inspectors General',
        url: 'oig://oversight?oigs=225,313',
        type: 'oig_html',
        note: 'Treasury OIG and Treasury IG for Tax Administration reports via the Oversight.gov (CIGIE) aggregator; coverage depends on OIG self-submission to CIGIE',
        health: {
          isCanary: false,
          expectedFrequency: 'weekly',
          // Treasury ~1.3/wk + TIGTA ~1.6/wk (228 reports combined over the
          // ~80-week current term, measured 2026-08-01).
          maxSilentDays: 14,
          expectedMinWeeklyDocs: 1,
        },
      },
    ],
  },
  {
    key: 'executiveOversight',
    title: 'Government Watchdogs (Inspectors General)',
    description:
      'Government actions that weaken independent oversight — firing or sidelining Inspectors General, blocking investigations, cutting audit resources, or leaving watchdog positions vacant to reduce accountability.',
    expertDescription:
      'Inspectors General provide independent oversight of executive agencies, with statutory protections against removal. Mass IG firings, vacancy manipulation, or resource cuts degrade the internal accountability infrastructure that deters waste, fraud, and abuse of power across the federal government.',
    signals: [
      {
        id: 'gao_reports',
        name: 'GAO Reports & Testimonies',
        url: 'gao://products',
        type: 'gao_wayback',
        note: 'GAO product-page highlights via Wayback replay (gao.gov WAF-blocks non-browser fetches; GovInfo GAOREPORTS is a dead pre-2009 archive, #529/#739); backfill via backfill:gao',
        health: {
          isCanary: false,
          expectedFrequency: 'daily',
          maxSilentDays: 10,
          expectedMinWeeklyDocs: 8,
        },
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
        // nosemgrep: opengrep.unscoped-fr-signal — IGs exist in every agency; scoping would miss relevant documents
        url: '/api/federal-register?term=%22inspector+general%22',
        type: 'federal_register',
        note: 'Federal Register documents mentioning Inspector General activities',
      },
      {
        id: 'fr_oversight',
        name: 'Oversight & Accountability',
        // nosemgrep: opengrep.unscoped-fr-signal — oversight bodies exist cross-agency; terms tightened to IG/GAO/boards
        url: '/api/federal-register?term=%22inspector+general%22+|+%22government+accountability%22+|+%22oversight+board%22',
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
        // nosemgrep: opengrep.unscoped-fr-signal — IG personnel changes happen cross-agency
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
      {
        id: 'oig_dhs',
        name: 'DHS Inspector General',
        url: 'oig://dhs',
        type: 'oig_html',
        note: 'DHS OIG audit/inspection reports, management alerts, and whistleblower retaliation ROIs via HTML scraping (oig.dhs.gov); listings link directly to report PDFs',
        health: {
          isCanary: false,
          expectedFrequency: 'weekly',
          // DHS OIG publishes ~0.7 reports/week recently; a 14-day silence
          // window (DOJ's setting) would false-alarm on normal gaps.
          maxSilentDays: 30,
          expectedMinWeeklyDocs: 1,
        },
      },
      {
        id: 'oig_oversight_state',
        name: 'State Department Inspector General',
        url: 'oig://oversight?oigs=223',
        type: 'oig_html',
        note: 'State OIG reports via the Oversight.gov (CIGIE) aggregator — the only path to State OIG (direct site blocks fetchers); coverage depends on OIG self-submission to CIGIE',
        health: {
          isCanary: false,
          expectedFrequency: 'weekly',
          // State OIG publishes ~1/week (76 reports over the ~80-week current
          // term, measured 2026-08-01).
          maxSilentDays: 30,
          expectedMinWeeklyDocs: 1,
        },
      },
      {
        id: 'oig_oversight_icig',
        name: 'Intelligence Community Inspector General',
        url: 'oig://oversight?oigs=284',
        type: 'oig_html',
        note: 'IC IG reports via the Oversight.gov (CIGIE) aggregator — the only path to the IC IG; sparse but mission-critical (IG independence)',
        health: {
          isCanary: false,
          expectedFrequency: 'weekly',
          // ICIG publishes ~1/quarter (2 reports over the ~80-week current
          // term, measured 2026-08-01) — long silence is its normal cadence.
          maxSilentDays: 180,
          expectedMinWeeklyDocs: 1,
        },
      },
    ],
  },
  {
    key: 'hatch',
    title: 'Political Campaigning Rules (Hatch Act)',
    description:
      'Government workers should serve all Americans, not just one political party. The Hatch Act is a law that stops them from campaigning while at work.',
    expertDescription:
      'The Hatch Act creates a firewall between partisan politics and federal administration. When enforcement weakens or violations go unpunished, the civil service risks becoming an extension of party apparatus — eroding public trust in government neutrality and the nonpartisan delivery of services.',
    signals: [
      {
        id: 'fr_hatch_act',
        name: 'Hatch Act News',
        url: '/api/federal-register?term=%22hatch+act%22&agency=special-counsel-office,personnel-management-office,executive-office-of-the-president',
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
      "Government actions that undermine the judiciary's ability to function as an independent check — defying or circumventing court orders, retaliating against specific judges, firing judicial branch personnel, or restructuring court jurisdiction to avoid oversight. Routine judicial appointments, confirmations, and case rulings are NOT erosion signals.",
    expertDescription:
      "Judicial independence is the cornerstone of constitutional governance. Executive non-compliance with court orders, attempts to restructure court jurisdiction, or politicized judicial appointments erode the judiciary's ability to serve as a check on executive and legislative power.",
    signals: [
      {
        id: 'fr_court_compliance',
        name: 'Court Compliance Reports',
        url: '/api/federal-register?term=injunction+compliance&agency=justice-department,executive-office-of-the-president',
        type: 'federal_register',
        note: 'Looking for reports about following (or not following) court orders',
      },
      {
        id: 'fr_judicial_nominations',
        name: 'Judicial Nominations',
        url: '/api/federal-register?term=%22judicial+nomination%22+|+%22judicial+appointment%22&agency=justice-department,executive-office-of-the-president',
        type: 'federal_register',
        note: 'Tracking judicial nominations and appointments',
      },
      {
        id: 'fr_court_structure',
        name: 'Court Structure Changes',
        url: '/api/federal-register?term=%22court+jurisdiction%22+|+%22judicial+reform%22&agency=justice-department,executive-office-of-the-president',
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
        id: 'fr_national_emergency',
        name: 'National Emergency Declarations',
        url: '/api/federal-register?term=%22national+emergency%22&agency=executive-office-of-the-president,defense-department,homeland-security-department',
        type: 'federal_register',
        note: 'National emergency declarations, IEEPA, and related executive emergency actions',
      },
      {
        id: 'fr_national_guard',
        name: 'National Guard & Domestic Deployment',
        url: '/api/federal-register?term=%22national+guard%22+deployment&agency=defense-department,homeland-security-department,executive-office-of-the-president',
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
        url: '/api/federal-register?term=%22executive+order%22+|+%22regulatory+review%22+|+%22independent+agency%22&agency=management-and-budget-office,executive-office-of-the-president',
        type: 'federal_register',
        note: 'Executive interventions in independent agency rulemaking',
      },
      {
        id: 'fr_oira',
        name: 'OIRA Regulatory Review',
        url: '/api/federal-register?term=oira+|+%22regulatory+review%22+|+%22regulatory+clearance%22+|+%22executive+oversight%22&agency=management-and-budget-office,executive-office-of-the-president',
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
    title: 'Executive Actions',
    description:
      'Tracking presidential actions and new regulations. Government actions that bypass normal legislative or regulatory processes, concentrate decision-making authority, or expand executive power beyond established norms.',
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
      'Government actions that reduce public access to information — removing datasets, taking down websites, suppressing mandated reports, restricting FOIA compliance, or defunding transparency infrastructure.',
    expertDescription:
      "Public access to government data, FOIA compliance, and publication of mandated reports form the transparency infrastructure that enables democratic accountability. Removal of datasets, website takedowns, or suppression of required disclosures reduces the public's ability to monitor government conduct.",
    signals: [
      {
        id: 'fr_foia',
        name: 'FOIA & Transparency Rules',
        // nosemgrep: opengrep.unscoped-fr-signal — FOIA applies to every federal agency
        url: '/api/federal-register?term=%22freedom+of+information%22+|+FOIA+|+transparency+|+disclosure',
        type: 'federal_register',
        note: 'FOIA-related Federal Register documents',
      },
      {
        id: 'fr_open_data',
        name: 'Public Records & Data Access',
        // nosemgrep: opengrep.unscoped-fr-signal — open government applies cross-agency
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
      'Government actions that undermine free and fair elections — restricting voter access, defunding election security, weakening FEC enforcement, interfering with election certification, or politicizing election administration.',
    expertDescription:
      'Free and fair elections require independent administration, equitable ballot access, and transparent campaign finance. Federal actions that alter voter eligibility rules, defund election security, weaken FEC enforcement, or challenge certification processes threaten the foundational mechanism of democratic legitimacy.',
    signals: [
      {
        id: 'fr_election_integrity',
        name: 'Election Integrity & Interference',
        url: '/api/federal-register?term=%22election+integrity%22+|+%22election+interference%22+|+%22voting+rights%22+|+%22ballot+access%22&agency=justice-department,election-assistance-commission,federal-election-commission',
        type: 'federal_register',
        note: 'Federal actions affecting election integrity and voter access',
      },
      {
        id: 'fr_election_admin',
        name: 'Election Administration Changes',
        url: '/api/federal-register?term=%22election+commission%22+|+%22election+certification%22+|+recount+|+%22polling+place%22&agency=justice-department,election-assistance-commission,federal-election-commission',
        type: 'federal_register',
        note: 'Changes to election administration and oversight',
      },
      {
        id: 'fr_election_presdocu',
        name: 'Presidential Documents: Elections',
        url: '/api/federal-register?type=PRESDOCU&term=election+|+voting+|+voter+|+ballot+|+%22citizenship+verification%22+|+%22election+integrity%22',
        type: 'federal_register',
        note: 'Executive orders and proclamations affecting elections and voting',
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
      {
        id: 'oig_oversight_elections',
        name: 'EAC & FEC Inspectors General',
        url: 'oig://oversight?oigs=229,236',
        type: 'oig_html',
        note: 'Election Assistance Commission and FEC OIG reports via the Oversight.gov (CIGIE) aggregator; coverage depends on OIG self-submission to CIGIE',
        health: {
          isCanary: false,
          expectedFrequency: 'weekly',
          // EAC ~0.26/wk + FEC ~0.15/wk (33 reports combined over the ~80-week
          // current term, measured 2026-08-01) — sparse by nature.
          maxSilentDays: 60,
          expectedMinWeeklyDocs: 1,
        },
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
      // FR full-text search matches the FOIA/public-records boilerplate present
      // in nearly every notice's body, so broad terms ("FOIA", "freedom of
      // information", "public records") retrieved ~576 docs/90d of which the
      // #524 filter dropped 99.5% (R-FUNNEL finding). FR's `conditions[term]`
      // has no working OR (`|`/`OR`/space all fail) and no title-scoped search,
      // so each genuinely-specific phrase is its own quoted single-phrase signal
      // — verified against the live FR API to be low-noise and on-topic.
      {
        id: 'fr_foia_regulations',
        name: 'FOIA Regulations',
        // nosemgrep: opengrep.unscoped-fr-signal — FOIA policy applies cross-agency
        url: '/api/federal-register?term=%22FOIA+regulations%22',
        type: 'federal_register',
        note: 'Agency rules amending Freedom of Information Act regulations',
      },
      {
        id: 'fr_foia_fees',
        name: 'FOIA Fees',
        // nosemgrep: opengrep.unscoped-fr-signal — FOIA policy applies cross-agency
        url: '/api/federal-register?term=%22FOIA+fees%22',
        type: 'federal_register',
        note: 'FOIA fee schedules/changes that can raise access barriers',
      },
      {
        id: 'fr_press_credentials',
        name: 'Press Credentials',
        // nosemgrep: opengrep.unscoped-fr-signal — press access applies cross-agency
        url: '/api/federal-register?term=%22press+credentials%22',
        type: 'federal_register',
        note: 'Rules affecting press credentialing and access',
      },
      {
        id: 'fr_press_freedom',
        name: 'Press Freedom',
        // nosemgrep: opengrep.unscoped-fr-signal — press freedom applies cross-agency
        url: '/api/federal-register?term=%22press+freedom%22',
        type: 'federal_register',
        note: 'Rules referencing press freedom',
      },
      {
        id: 'fr_shield_law',
        name: 'Shield Law',
        // nosemgrep: opengrep.unscoped-fr-signal — reporter protection applies cross-agency
        url: '/api/federal-register?term=%22shield+law%22',
        type: 'federal_register',
        note: "Rules touching reporter's-privilege / shield-law protections",
      },
      {
        id: 'fr_prepublication_review',
        name: 'Prepublication Review',
        // nosemgrep: opengrep.unscoped-fr-signal — classification policy applies cross-agency
        url: '/api/federal-register?term=%22prepublication+review%22',
        type: 'federal_register',
        note: 'Rules on prepublication review / classification of information',
      },
    ],
  },
  {
    key: 'lawEnforcement',
    title: 'Federal Law Enforcement',
    description:
      'Government actions that politicize federal law enforcement — selective prosecution of political opponents, dropped investigations of allies, retaliation against career prosecutors, or weaponizing enforcement authority to suppress protected activity.',
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
      {
        id: 'ice_press_hsi',
        name: 'ICE HSI Criminal Investigation Releases',
        url: 'dhspress://ice?filter=hsi-criminal',
        type: 'dhs_press',
        note: 'HSI criminal-investigation subset of the ICE newsroom (owner-approved lawEnforcement fan-out; filter documented in the data dictionary)',
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
    key: 'civilLiberties',
    title: 'Civil Rights & Liberties',
    description:
      'Government actions that remove or weaken existing civil liberties protections — rescinding consent decrees, expanding warrantless surveillance, restricting due process for specific populations, or using executive authority to override court-ordered civil rights protections. Routine civil rights enforcement, advisory committees, and routine immigration administration and processing volume changes are NOT erosion signals.',
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
        url: '/api/federal-register?term=%22civil+rights%22+|+%22due+process%22+|+%22equal+protection%22+|+%22Title+VI%22+|+%22disparate+impact%22+|+%22fair+housing%22&agency=justice-department,homeland-security-department,education-department,health-and-human-services-department,equal-employment-opportunity-commission,civil-rights-commission,commerce-department,housing-and-urban-development-department,treasury-department,labor-department,transportation-department',
        type: 'federal_register',
        note: 'Federal Register documents on civil rights, due process, and Title VI enforcement across all implementing agencies',
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
      {
        id: 'oig_dhs_immigration',
        name: 'DHS Inspector General: Immigration Components',
        url: 'oig://dhs?components=immigration',
        type: 'oig_html',
        note: 'DHS OIG reports about ICE/CBP/USCIS, detention, and border enforcement (title-keyword subset of oig://dhs; filter documented in the data dictionary)',
        health: {
          isCanary: false,
          expectedFrequency: 'weekly',
          // ~43% of DHS OIG output is immigration-related (~0.3/week);
          // silence alone is not anomalous for a month.
          maxSilentDays: 30,
          expectedMinWeeklyDocs: 1,
        },
      },
      {
        id: 'dhs_press',
        name: 'DHS Press Releases',
        url: 'dhspress://dhs',
        type: 'dhs_press',
        note: 'DHS HQ news releases (live listing reaches back only to 2025-01-20; baseline recovery via /archive/news — see backfill:dhs-press)',
        health: {
          isCanary: false,
          expectedFrequency: 'daily',
          maxSilentDays: 7,
          expectedMinWeeklyDocs: 8,
        },
      },
      {
        id: 'ice_press',
        name: 'ICE News Releases',
        url: 'dhspress://ice',
        type: 'dhs_press',
        note: 'ICE newsroom releases incl. local operations (delisted pre-2025 releases remain live; baseline recovery via sitemap — see backfill:dhs-press)',
        health: {
          isCanary: false,
          expectedFrequency: 'daily',
          maxSilentDays: 7,
          expectedMinWeeklyDocs: 8,
        },
      },
      {
        id: 'cbp_press',
        name: 'CBP Media Releases (National)',
        url: 'dhspress://cbp?scope=national',
        type: 'dhs_press',
        note: 'CBP national media releases; port-level local-media-release class excluded at fetch (owner decision 2026-08-07, documented in the data dictionary)',
        health: {
          isCanary: false,
          expectedFrequency: 'weekly',
          maxSilentDays: 10,
          expectedMinWeeklyDocs: 3,
        },
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
