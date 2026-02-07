/**
 * Feed fixture data for all signals across 9 categories.
 * Each function returns the shape that parseResult() expects.
 */

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 86400000).toISOString();
}

// ─── Civil Service ───────────────────────────────────────────────

export function civilServiceOpm() {
  return {
    cached: false,
    type: 'federal_register',
    items: [
      {
        title: 'Proposed Rule: Accountability and Streamlining of the Federal Workforce',
        link: 'https://www.federalregister.gov/d/2025-00001',
        pubDate: daysAgo(1),
        agency: 'Office of Personnel Management',
        type: 'PRORULE',
      },
      {
        title: 'Notice: Revised Standards for Employee Performance Management',
        link: 'https://www.federalregister.gov/d/2025-00002',
        pubDate: daysAgo(3),
        agency: 'Office of Personnel Management',
        type: 'NOTICE',
      },
      {
        title: 'Final Rule: Merit System Principles — Implementation Updates',
        link: 'https://www.federalregister.gov/d/2025-00003',
        pubDate: daysAgo(5),
        agency: 'Office of Personnel Management',
        type: 'RULE',
      },
      {
        title: 'Notice: Workforce Reduction and Realignment Procedures',
        link: 'https://www.federalregister.gov/d/2025-00004',
        pubDate: daysAgo(7),
        agency: 'Office of Personnel Management',
        type: 'NOTICE',
      },
      {
        title: 'Proposed Rule: Political Appointee Conversion Pathway',
        link: 'https://www.federalregister.gov/d/2025-00005',
        pubDate: daysAgo(10),
        agency: 'Office of Personnel Management',
        type: 'PRORULE',
      },
    ],
    count: 5,
    url: 'https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=personnel-management-office',
  };
}

export function civilServiceScheduleF() {
  return {
    cached: false,
    type: 'federal_register',
    items: [
      {
        title: 'Executive Order: Restoring Schedule F Classification for Policy Positions',
        link: 'https://www.federalregister.gov/d/2025-00010',
        pubDate: daysAgo(2),
        agency: 'Executive Office of the President',
        type: 'PRESDOCU',
      },
      {
        title: 'OPM Guidance on Schedule F Implementation Timeline',
        link: 'https://www.federalregister.gov/d/2025-00011',
        pubDate: daysAgo(4),
        agency: 'Office of Personnel Management',
        type: 'NOTICE',
      },
      {
        title: 'Civil Service Reclassification: Schedule F Excepted Positions',
        link: 'https://www.federalregister.gov/d/2025-00012',
        pubDate: daysAgo(8),
        agency: 'Office of Personnel Management',
        type: 'PRORULE',
      },
      {
        title: 'Notice of Proposed Rulemaking: At-Will Employment for Policy-Adjacent Staff',
        link: 'https://www.federalregister.gov/d/2025-00013',
        pubDate: daysAgo(12),
        agency: 'Office of Personnel Management',
        type: 'PRORULE',
      },
    ],
    count: 4,
    url: 'https://www.federalregister.gov/api/v1/documents.json?conditions[term]=schedule+f+civil+service',
  };
}

// ─── Fiscal ──────────────────────────────────────────────────────

export function gaoReports() {
  return {
    cached: false,
    data: {
      type: 'rss',
      items: [
        {
          title: 'GAO Report: Review of OMB Apportionment Practices',
          link: 'https://www.gao.gov/reports/GAO-25-001',
          pubDate: daysAgo(1),
        },
        {
          title: 'GAO Report: Federal Budget Execution Delays in FY2025',
          link: 'https://www.gao.gov/reports/GAO-25-002',
          pubDate: daysAgo(3),
        },
        {
          title: 'GAO Decision: B-335991 — Legality of Deferred Spending',
          link: 'https://www.gao.gov/reports/GAO-25-003',
          pubDate: daysAgo(5),
        },
        {
          title: 'GAO Report: Agency Compliance with Congressional Appropriations',
          link: 'https://www.gao.gov/reports/GAO-25-004',
          pubDate: daysAgo(9),
        },
        {
          title: 'GAO Report: Impoundment Control Act Enforcement Review',
          link: 'https://www.gao.gov/reports/GAO-25-005',
          pubDate: daysAgo(14),
        },
        {
          title: 'GAO Testimony: Transparency in Federal Grant Administration',
          link: 'https://www.gao.gov/reports/GAO-25-006',
          pubDate: daysAgo(18),
        },
      ],
    },
  };
}

export function fiscalImpoundment() {
  return {
    cached: false,
    type: 'federal_register',
    items: [
      {
        title: 'OMB Memorandum: Impoundment Procedures for Discretionary Programs',
        link: 'https://www.federalregister.gov/d/2025-00020',
        pubDate: daysAgo(2),
        agency: 'Office of Management and Budget',
        type: 'NOTICE',
      },
      {
        title: 'Congressional Review: Proposed Rescission of Education Funding',
        link: 'https://www.federalregister.gov/d/2025-00021',
        pubDate: daysAgo(6),
        agency: 'Office of Management and Budget',
        type: 'NOTICE',
      },
      {
        title: 'Treasury Report on Deferred Obligations FY2025 Q1',
        link: 'https://www.federalregister.gov/d/2025-00022',
        pubDate: daysAgo(11),
        agency: 'Department of the Treasury',
        type: 'NOTICE',
      },
      {
        title: 'GAO Legal Opinion on EPA Funding Withholding',
        link: 'https://www.federalregister.gov/d/2025-00023',
        pubDate: daysAgo(15),
        agency: 'Government Accountability Office',
        type: 'NOTICE',
      },
    ],
    count: 4,
    url: 'https://www.federalregister.gov/api/v1/documents.json?conditions[term]=impoundment',
  };
}

// ─── Inspectors General ─────────────────────────────────────────

export function igsOversight() {
  return {
    cached: false,
    data: {
      type: 'html',
      anchors: [
        {
          text: 'Semi-Annual Report to Congress — HHS OIG',
          href: 'https://www.oversight.gov/reports/hhs-sar-2025',
        },
        {
          text: 'DOJ Inspector General Report: FBI Accountability Review',
          href: 'https://www.oversight.gov/reports/doj-fbi-review',
        },
        {
          text: 'DHS OIG: Border Enforcement Operations Audit',
          href: 'https://www.oversight.gov/reports/dhs-border-audit',
        },
        {
          text: 'VA Inspector General: Patient Wait Times Investigation',
          href: 'https://www.oversight.gov/reports/va-wait-times',
        },
        {
          text: 'Pentagon OIG: Defense Contract Oversight Report',
          href: 'https://www.oversight.gov/reports/dod-contracts',
        },
      ],
    },
  };
}

export function igsSsa() {
  return {
    cached: false,
    data: {
      type: 'rss',
      items: [
        {
          title: 'OIG Audit: SSA Disability Determination Services Backlog',
          link: 'https://oig.ssa.gov/reports/A-01-25-001',
          pubDate: daysAgo(2),
        },
        {
          title: 'OIG Investigation: Improper Payments in Supplemental Security Income',
          link: 'https://oig.ssa.gov/reports/A-01-25-002',
          pubDate: daysAgo(5),
        },
        {
          title: 'OIG Report: Information Technology Security at SSA',
          link: 'https://oig.ssa.gov/reports/A-01-25-003',
          pubDate: daysAgo(9),
        },
        {
          title: 'OIG Testimony: SSA Administrative Funding and Service Delivery',
          link: 'https://oig.ssa.gov/reports/A-01-25-004',
          pubDate: daysAgo(14),
        },
      ],
    },
  };
}

// ─── Hatch Act ──────────────────────────────────────────────────

export function hatchActNews() {
  return {
    cached: false,
    type: 'federal_register',
    items: [
      {
        title: 'OSC Advisory Opinion: Social Media Use by Senior Officials',
        link: 'https://www.federalregister.gov/d/2025-00030',
        pubDate: daysAgo(3),
        agency: 'Office of Special Counsel',
        type: 'NOTICE',
      },
      {
        title: 'Hatch Act Violation Report: White House Staff Campaign Activities',
        link: 'https://www.federalregister.gov/d/2025-00031',
        pubDate: daysAgo(7),
        agency: 'Office of Special Counsel',
        type: 'NOTICE',
      },
      {
        title: 'Notice of Disciplinary Action: Hatch Act Violations at HUD',
        link: 'https://www.federalregister.gov/d/2025-00032',
        pubDate: daysAgo(12),
        agency: 'Office of Special Counsel',
        type: 'NOTICE',
      },
      {
        title: 'OSC Annual Report on Hatch Act Enforcement Activities',
        link: 'https://www.federalregister.gov/d/2025-00033',
        pubDate: daysAgo(20),
        agency: 'Office of Special Counsel',
        type: 'NOTICE',
      },
    ],
    count: 4,
    url: 'https://www.federalregister.gov/api/v1/documents.json?conditions[term]=hatch+act',
  };
}

export function hatchSpecialCounsel() {
  return {
    cached: false,
    type: 'federal_register',
    items: [
      {
        title: 'Office of Special Counsel: Whistleblower Protection Program Update',
        link: 'https://www.federalregister.gov/d/2025-00035',
        pubDate: daysAgo(4),
        agency: 'Office of Special Counsel',
        type: 'NOTICE',
      },
      {
        title: 'OSC Guidance: Prohibited Personnel Practices Under 5 U.S.C. § 2302',
        link: 'https://www.federalregister.gov/d/2025-00036',
        pubDate: daysAgo(8),
        agency: 'Office of Special Counsel',
        type: 'NOTICE',
      },
      {
        title: 'Special Counsel Complaint Filing Procedures — Updated',
        link: 'https://www.federalregister.gov/d/2025-00037',
        pubDate: daysAgo(16),
        agency: 'Office of Special Counsel',
        type: 'NOTICE',
      },
    ],
    count: 3,
    url: 'https://www.federalregister.gov/api/v1/documents.json?conditions[agencies][]=special-counsel-office',
  };
}

// ─── Courts ─────────────────────────────────────────────────────

export function courtsSupreme() {
  return {
    cached: false,
    data: {
      type: 'rss',
      items: [
        {
          title: 'Order List: January 2025 — Certiorari Grants',
          link: 'https://www.supremecourt.gov/orders/courtorders/012025zor',
          pubDate: daysAgo(1),
        },
        {
          title: 'Slip Opinion: Dept. of Education v. Brown — Student Loan Authority',
          link: 'https://www.supremecourt.gov/opinions/24pdf/23-1234',
          pubDate: daysAgo(4),
        },
        {
          title: 'Order: Emergency Stay in EPA v. State of Texas',
          link: 'https://www.supremecourt.gov/orders/courtorders/012025stay',
          pubDate: daysAgo(6),
        },
        {
          title: 'Slip Opinion: NLRB v. Starbucks — Agency Authority Review',
          link: 'https://www.supremecourt.gov/opinions/24pdf/23-5678',
          pubDate: daysAgo(10),
        },
        {
          title: 'Order: Denied — Petition for Writ of Mandamus re: Executive Privilege',
          link: 'https://www.supremecourt.gov/orders/courtorders/012025deny',
          pubDate: daysAgo(13),
        },
      ],
    },
  };
}

export function courtsCompliance() {
  return {
    cached: false,
    type: 'federal_register',
    items: [
      {
        title: 'DOJ Report: Compliance with Federal Court Injunctions — Q4 2024',
        link: 'https://www.federalregister.gov/d/2025-00040',
        pubDate: daysAgo(3),
        agency: 'Department of Justice',
        type: 'NOTICE',
      },
      {
        title: 'Notice: District Court Compliance Order — Immigration Enforcement',
        link: 'https://www.federalregister.gov/d/2025-00041',
        pubDate: daysAgo(7),
        agency: 'Department of Justice',
        type: 'NOTICE',
      },
      {
        title: 'Federal Register: Contempt Finding and Remedial Order — EPA Consent Decree',
        link: 'https://www.federalregister.gov/d/2025-00042',
        pubDate: daysAgo(11),
        agency: 'Environmental Protection Agency',
        type: 'NOTICE',
      },
      {
        title: 'Court Order: Mandatory Compliance Timeline for Federal Agencies',
        link: 'https://www.federalregister.gov/d/2025-00043',
        pubDate: daysAgo(18),
        agency: 'Department of Justice',
        type: 'NOTICE',
      },
    ],
    count: 4,
    url: 'https://www.federalregister.gov/api/v1/documents.json?conditions[term]=injunction+compliance',
  };
}

// ─── Military ───────────────────────────────────────────────────

export function militaryNews() {
  return {
    cached: false,
    data: {
      type: 'rss',
      items: [
        {
          title: 'DOD News: Secretary Austin Announces New Cybersecurity Initiative',
          link: 'https://www.defense.gov/News/Releases/Release/Article/1001',
          pubDate: daysAgo(1),
        },
        {
          title: 'DOD News: Joint Chiefs Brief on NATO Readiness Posture',
          link: 'https://www.defense.gov/News/Releases/Release/Article/1002',
          pubDate: daysAgo(3),
        },
        {
          title: 'DOD News: Pacific Command Training Exercise Concludes',
          link: 'https://www.defense.gov/News/Releases/Release/Article/1003',
          pubDate: daysAgo(5),
        },
        {
          title: 'DOD News: Military Housing Improvement Program Update',
          link: 'https://www.defense.gov/News/Releases/Release/Article/1004',
          pubDate: daysAgo(8),
        },
      ],
    },
  };
}

export function militaryContracts() {
  return {
    cached: false,
    data: {
      type: 'rss',
      items: [
        {
          title: 'Contracts: Lockheed Martin — F-35 Sustainment Modification',
          link: 'https://www.defense.gov/News/Contracts/Contract/Article/2001',
          pubDate: daysAgo(1),
        },
        {
          title: 'Contracts: Raytheon Technologies — Patriot System Upgrade',
          link: 'https://www.defense.gov/News/Contracts/Contract/Article/2002',
          pubDate: daysAgo(2),
        },
        {
          title: 'Contracts: General Dynamics — Ship Maintenance',
          link: 'https://www.defense.gov/News/Contracts/Contract/Article/2003',
          pubDate: daysAgo(4),
        },
        {
          title: 'Contracts: Northrop Grumman — B-21 Production Lot 2',
          link: 'https://www.defense.gov/News/Contracts/Contract/Article/2004',
          pubDate: daysAgo(6),
        },
        {
          title: 'Contracts: Boeing — KC-46A Tanker Spares',
          link: 'https://www.defense.gov/News/Contracts/Contract/Article/2005',
          pubDate: daysAgo(9),
        },
      ],
    },
  };
}

// ─── Rulemaking ─────────────────────────────────────────────────

export function rulemakingFinal() {
  return {
    cached: false,
    type: 'federal_register',
    items: [
      {
        title: 'Final Rule: EPA Air Quality Standards — Particulate Matter Revision',
        link: 'https://www.federalregister.gov/d/2025-00050',
        pubDate: daysAgo(2),
        agency: 'Environmental Protection Agency',
        type: 'RULE',
      },
      {
        title: 'Final Rule: FTC Noncompete Clause Ban — Implementation',
        link: 'https://www.federalregister.gov/d/2025-00051',
        pubDate: daysAgo(5),
        agency: 'Federal Trade Commission',
        type: 'RULE',
      },
      {
        title: 'Final Rule: SEC Climate Disclosure Requirements',
        link: 'https://www.federalregister.gov/d/2025-00052',
        pubDate: daysAgo(8),
        agency: 'Securities and Exchange Commission',
        type: 'RULE',
      },
      {
        title: 'Final Rule: FDA Food Labeling — Added Sugars',
        link: 'https://www.federalregister.gov/d/2025-00053',
        pubDate: daysAgo(12),
        agency: 'Food and Drug Administration',
        type: 'RULE',
      },
      {
        title: 'Final Rule: DOL Overtime Threshold Adjustment',
        link: 'https://www.federalregister.gov/d/2025-00054',
        pubDate: daysAgo(16),
        agency: 'Department of Labor',
        type: 'RULE',
      },
      {
        title: 'Final Rule: HHS Hospital Price Transparency Enforcement',
        link: 'https://www.federalregister.gov/d/2025-00055',
        pubDate: daysAgo(20),
        agency: 'Department of Health and Human Services',
        type: 'RULE',
      },
    ],
    count: 6,
    url: 'https://www.federalregister.gov/api/v1/documents.json?conditions[type][]=RULE',
  };
}

export function rulemakingProposed() {
  return {
    cached: false,
    type: 'federal_register',
    items: [
      {
        title: 'Proposed Rule: DOE Energy Efficiency Standards for Appliances',
        link: 'https://www.federalregister.gov/d/2025-00060',
        pubDate: daysAgo(1),
        agency: 'Department of Energy',
        type: 'PRORULE',
      },
      {
        title: 'Proposed Rule: FCC Net Neutrality Restoration',
        link: 'https://www.federalregister.gov/d/2025-00061',
        pubDate: daysAgo(4),
        agency: 'Federal Communications Commission',
        type: 'PRORULE',
      },
      {
        title: 'Proposed Rule: CFPB Overdraft Fee Limitations',
        link: 'https://www.federalregister.gov/d/2025-00062',
        pubDate: daysAgo(7),
        agency: 'Consumer Financial Protection Bureau',
        type: 'PRORULE',
      },
      {
        title: 'Proposed Rule: OSHA Heat Illness Prevention Standard',
        link: 'https://www.federalregister.gov/d/2025-00063',
        pubDate: daysAgo(11),
        agency: 'Occupational Safety and Health Administration',
        type: 'PRORULE',
      },
    ],
    count: 4,
    url: 'https://www.federalregister.gov/api/v1/documents.json?conditions[type][]=PRORULE',
  };
}

// ─── Indices (Democracy Health) ─────────────────────────────────

export function indicesPresidential() {
  return {
    cached: false,
    type: 'federal_register',
    items: [
      {
        title: 'Executive Order 14XXX: Reforming Federal Regulatory Process',
        link: 'https://www.federalregister.gov/d/2025-00070',
        pubDate: daysAgo(1),
        agency: 'Executive Office of the President',
        type: 'PRESDOCU',
      },
      {
        title: 'Presidential Memorandum: Agency Regulatory Freeze Pending Review',
        link: 'https://www.federalregister.gov/d/2025-00071',
        pubDate: daysAgo(3),
        agency: 'Executive Office of the President',
        type: 'PRESDOCU',
      },
      {
        title: 'Executive Order: Establishing Government Efficiency Commission',
        link: 'https://www.federalregister.gov/d/2025-00072',
        pubDate: daysAgo(6),
        agency: 'Executive Office of the President',
        type: 'PRESDOCU',
      },
      {
        title: 'Proclamation: National Emergency — Southern Border',
        link: 'https://www.federalregister.gov/d/2025-00073',
        pubDate: daysAgo(10),
        agency: 'Executive Office of the President',
        type: 'PRESDOCU',
      },
      {
        title: 'Executive Order: Review of Agency Independence and Accountability',
        link: 'https://www.federalregister.gov/d/2025-00074',
        pubDate: daysAgo(14),
        agency: 'Executive Office of the President',
        type: 'PRESDOCU',
      },
    ],
    count: 5,
    url: 'https://www.federalregister.gov/api/v1/documents.json?conditions[type][]=PRESDOCU',
  };
}
