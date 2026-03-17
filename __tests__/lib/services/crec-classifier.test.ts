import { describe, it, expect } from 'vitest';
import { classifyCrecToCategories } from '@/lib/services/crec-classifier';

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
