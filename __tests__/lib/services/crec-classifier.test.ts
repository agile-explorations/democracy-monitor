import { describe, it, expect } from 'vitest';
import {
  classifyCrecToCategories,
  classifyHearingToCategories,
  classifyOpinionToCategories,
} from '@/lib/services/crec-classifier';

describe('classifyCrecToCategories', () => {
  it('routes speech about federal workforce to civilService', () => {
    const categories = classifyCrecToCategories(
      'Federal Workforce Challenges',
      'We must protect federal employees from political retaliation.',
    );
    expect(categories).toContain('civilService');
  });

  it('routes speech mentioning immigration to immigrationEnforcement', () => {
    const categories = classifyCrecToCategories(
      'Border Security',
      'The immigration crisis at our southern border demands immediate action.',
    );
    expect(categories).toContain('immigrationEnforcement');
  });

  it('routes speech about inspector general to executiveOversight', () => {
    const categories = classifyCrecToCategories(
      'Independent Oversight',
      'The inspector general was removed from office last Friday.',
    );
    expect(categories).toContain('executiveOversight');
  });

  it('routes speech about court orders to judicialIndependence', () => {
    const categories = classifyCrecToCategories(
      'Judicial Independence',
      'The Administration must comply with the court order issued last week.',
    );
    expect(categories).toContain('judicialIndependence');
  });

  it('routes to multiple categories for cross-cutting speech', () => {
    const categories = classifyCrecToCategories(
      'Government Oversight',
      'The probationary employee firings and the inspector general removal demand answers.',
    );
    expect(categories.length).toBeGreaterThanOrEqual(2);
    expect(categories).toContain('civilService');
    expect(categories).toContain('executiveOversight');
  });

  it('returns empty array for off-topic content', () => {
    const categories = classifyCrecToCategories(
      'HONORING JONES DAIRY',
      'I rise today to honor Jones Dairy in my district for their anniversary of serving fresh milk.',
    );
    expect(categories).toEqual([]);
  });

  it('matches on title alone when text is null', () => {
    const categories = classifyCrecToCategories('Protecting Federal Employees');
    expect(categories).toContain('civilService');
  });

  it('is case-insensitive', () => {
    const categories = classifyCrecToCategories(
      'INSPECTOR GENERAL OVERSIGHT',
      'THE IG WAS FIRED WITHOUT CAUSE.',
    );
    expect(categories).toContain('executiveOversight');
  });

  // These tests verify that broad topic routing works where narrow
  // ASSESSMENT_RULES keywords would miss (the original 0-match problem)
  it('routes general immigration debate (not just erosion phrases)', () => {
    const categories = classifyCrecToCategories(
      'COMPREHENSIVE IMMIGRATION REFORM',
      'We need to address the asylum backlog and improve our immigration courts.',
    );
    expect(categories).toContain('immigrationEnforcement');
  });

  it('routes general oversight debate (not just "ig fired")', () => {
    const categories = classifyCrecToCategories(
      'GOVERNMENT ACCOUNTABILITY',
      'The GAO report found significant waste in this program. We need stronger oversight.',
    );
    expect(categories).toContain('executiveOversight');
  });

  it('routes executive order debate without erosion language', () => {
    const categories = classifyCrecToCategories(
      'PRESIDENTIAL AUTHORITY',
      'The executive order signed yesterday exceeds the authority granted under Article II.',
    );
    expect(categories).toContain('executiveActions');
  });

  it('routes DOJ discussion to lawEnforcement', () => {
    const categories = classifyCrecToCategories(
      'DEPARTMENT OF JUSTICE PRIORITIES',
      'The Attorney General testified before the judiciary committee on FBI operations.',
    );
    expect(categories).toContain('lawEnforcement');
  });

  it('routes budget debate to fiscal', () => {
    const categories = classifyCrecToCategories(
      'FISCAL YEAR 2026 BUDGET',
      'The continuing resolution expires next week and we face a government shutdown.',
    );
    expect(categories).toContain('fiscal');
  });
});

describe('classifyOpinionToCategories', () => {
  const ERISA_BOILERPLATE =
    "Before the court is defendant's motion for summary judgment. The district court " +
    'has jurisdiction under 28 U.S.C. § 1331. Plaintiff alleges the plan administrator ' +
    'violated ERISA fiduciary duties. The court order below granted an injunction; the ' +
    'appellate court reviews de novo. Due process requires notice and an opportunity to ' +
    'be heard. The reporter of decisions is directed to publish this opinion.';

  it('routes generic-boilerplate opinions nowhere', () => {
    expect(classifyOpinionToCategories('Smith v. Acme Benefits Plan', ERISA_BOILERPLATE)).toEqual(
      [],
    );
  });

  it('routes agency-removal opinions to rulemaking via removal-power vocabulary', () => {
    const cats = classifyOpinionToCategories(
      'Trump v. Slaughter',
      'The question presented is whether the removal protection for Commissioners of the ' +
        'Federal Trade Commission violates the separation of powers. We overrule ' +
        "Humphrey's Executor and hold the President may remove Commissioners at will. " +
        'The independent agency structure cannot constrain the removal power.',
    );
    expect(cats).toContain('rulemaking');
    expect(cats).toContain('judicialIndependence'); // separation of powers survives excludes
  });

  it('routes Alien Enemies Act opinions to immigrationEnforcement', () => {
    const cats = classifyOpinionToCategories(
      'Trump v. J. G. G.',
      'The government invoked the Alien Enemies Act to remove Venezuelan nationals. ' +
        'The proclamation designated the gang as a foreign terrorist organization and ' +
        'directed summary removal without hearings.',
    );
    expect(cats).toContain('immigrationEnforcement');
  });

  it('routes birthright-citizenship EO challenges to executiveActions', () => {
    const cats = classifyOpinionToCategories(
      'State of New Jersey v. Trump',
      'The States challenge Executive Order 14160, which purports to deny birthright ' +
        'citizenship to children of certain noncitizens. The district court enjoined the order.',
    );
    expect(cats).toContain('executiveActions');
  });

  it('routes impoundment litigation to fiscal without the excluded generic terms', () => {
    const cats = classifyOpinionToCategories(
      'Citizens for Responsibility and Ethics in Washington v. OMB',
      'Plaintiffs allege the administration violated the Impoundment Control Act by ' +
        'withholding of funds Congress appropriated for the program.',
    );
    expect(cats).toContain('fiscal');
  });

  it('only classifies within the text cap', () => {
    const padding = 'lorem ipsum '.repeat(400); // ~4800 chars, past the 4000 cap
    const cats = classifyOpinionToCategories(
      'Doe v. Roe',
      `${padding} the Impoundment Control Act violation appears only past the cap`,
      { textCap: 4000 },
    );
    expect(cats).toEqual([]);
    const catsWide = classifyOpinionToCategories(
      'Doe v. Roe',
      `${padding} the Impoundment Control Act violation appears only past the cap`,
      { textCap: 10000 },
    );
    expect(catsWide).toContain('fiscal');
  });

  it('applies additions but not to CREC classification', () => {
    const opinionCats = classifyOpinionToCategories(
      'A v. B',
      'The Alien Enemies Act authorizes summary apprehension.',
    );
    expect(opinionCats).toContain('immigrationEnforcement');
    // CREC classifier is untouched by opinion additions/excludes:
    const crecCats = classifyCrecToCategories('A v. B', 'The court order and injunction issued.');
    expect(crecCats).toContain('judicialIndependence');
  });
});

describe('classifyHearingToCategories', () => {
  it('routes an oversight hearing to executiveOversight via title alone', () => {
    const cats = classifyHearingToCategories(
      'Oversight of the Department of Justice Office of the Inspector General',
    );
    expect(cats).toContain('executiveOversight');
  });

  it('routes an immigration hearing by title + opening statement', () => {
    const cats = classifyHearingToCategories(
      'E-Verify: Ensuring Lawful Employment in America',
      'The subcommittee will examine immigration enforcement in the workplace and the ' +
        'role of ICE worksite investigations in unlawful employment of aliens.',
    );
    expect(cats).toContain('immigrationEnforcement');
  });

  it('only classifies against the capped head of the transcript', () => {
    const padding = 'procedural matters and scheduling remarks. '.repeat(200); // > 6,000 chars
    const cats = classifyHearingToCategories(
      'Member Day',
      padding + ' The committee then turned to inspector general independence.',
    );
    expect(cats).toEqual([]);
  });

  it('returns empty for off-topic hearings (caller drops + ledgers them)', () => {
    const cats = classifyHearingToCategories(
      'The Future of Rural Broadband Deployment',
      'Witnesses discussed fiber optic infrastructure grants for underserved counties.',
    );
    expect(cats).toEqual([]);
  });

  it('fans out multi-topic hearings to multiple categories', () => {
    const cats = classifyHearingToCategories(
      'Executive Overreach: Inspector General Removals and the Federal Workforce',
      'The hearing examined the removal of inspectors general and Schedule F ' +
        'reclassification of civil service employees.',
    );
    expect(cats).toContain('executiveOversight');
    expect(cats).toContain('civilService');
  });
});
