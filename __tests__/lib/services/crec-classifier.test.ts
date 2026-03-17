import { describe, it, expect } from 'vitest';
import { classifyCrecToCategories } from '@/lib/services/crec-classifier';

describe('classifyCrecToCategories', () => {
  it('classifies speech containing civilService keywords', () => {
    const categories = classifyCrecToCategories(
      'Schedule F',
      'The proposed rule would allow mass termination of federal employees in policy-influencing positions.',
    );
    expect(categories).toContain('civilService');
  });

  it('classifies speech containing immigrationEnforcement keywords', () => {
    const categories = classifyCrecToCategories(
      'Border Security',
      'The policy of expedited removal expanded to cover individuals found within 100 miles of the border.',
    );
    expect(categories).toContain('immigrationEnforcement');
  });

  it('classifies speech containing executiveOversight keywords', () => {
    const categories = classifyCrecToCategories(
      'Independent Oversight',
      'The inspector general removed from office last Friday had been investigating waste in the agency.',
    );
    expect(categories).toContain('executiveOversight');
  });

  it('classifies speech containing judicialIndependence keywords', () => {
    const categories = classifyCrecToCategories(
      'Rule of Law',
      'The Administration has defied court order and shown contempt of court in this matter.',
    );
    expect(categories).toContain('judicialIndependence');
  });

  it('returns multiple categories for cross-cutting speech', () => {
    const categories = classifyCrecToCategories(
      'Government Workforce',
      'The mass termination of probationary employees and the inspector general removed from the agency.',
    );
    expect(categories.length).toBeGreaterThanOrEqual(2);
    expect(categories).toContain('civilService');
    expect(categories).toContain('executiveOversight');
  });

  it('returns empty array for content matching no keywords', () => {
    const categories = classifyCrecToCategories(
      'HONORING JONES DAIRY',
      'I rise today to honor Jones Dairy in my district for their anniversary of serving fresh milk.',
    );
    expect(categories).toEqual([]);
  });

  it('matches on title alone when text is null', () => {
    const categories = classifyCrecToCategories('Mass termination of federal employees');
    expect(categories).toContain('civilService');
  });

  it('is case-insensitive', () => {
    const categories = classifyCrecToCategories(
      'INSPECTOR GENERAL REMOVED',
      'THE IG FIRED WITHOUT CAUSE.',
    );
    expect(categories).toContain('executiveOversight');
  });
});
