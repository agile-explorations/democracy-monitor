import { describe, it, expect } from 'vitest';
import { analyzeContent } from '@/lib/services/assessment-service';

describe('analyzeContent', () => {
  it('returns Warning for unknown category', () => {
    const result = analyzeContent([], 'nonexistent');
    expect(result.status).toBe('Warning');
    expect(result.reason).toContain('No assessment rules');
  });

  it('returns Stable when items have no matching keywords', () => {
    const items = [
      { title: 'Routine quarterly report on agency operations' },
      { title: 'Annual budget summary released' },
    ];
    const result = analyzeContent(items, 'civilService');
    expect(result.status).toBe('Stable');
    expect(result.matches).toHaveLength(0);
  });

  it('returns Warning for a single drift keyword match', () => {
    const items = [
      { title: 'New reclassification of positions announced' },
    ];
    const result = analyzeContent(items, 'civilService');
    expect(result.status).toBe('Warning');
    expect(result.matches).toContain('reclassification');
  });

  it('returns Drift for multiple drift keyword matches', () => {
    const items = [
      { title: 'Reclassification of career staff positions' },
      { title: 'Excepted service expanded significantly' },
    ];
    const result = analyzeContent(items, 'civilService');
    expect(result.status).toBe('Drift');
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
  });

  it('returns Capture when capture keywords are found', () => {
    const items = [
      { title: 'Schedule F executive order reinstated' },
    ];
    const result = analyzeContent(items, 'civilService');
    expect(result.status).toBe('Capture');
    expect(result.matches.some(m => m.includes('schedule f'))).toBe(true);
  });

  it('returns Capture with high authority flag for GAO findings', () => {
    const items = [
      { title: 'GAO decision: violated impoundment control act', agency: 'GAO' },
    ];
    const result = analyzeContent(items, 'fiscal');
    expect(result.status).toBe('Capture');
    expect(result.detail?.hasAuthoritative).toBe(true);
  });

  it('handles igs oversight.gov down special case', () => {
    const items = [
      { title: '⚠️ Oversight.gov - CURRENTLY DOWN' },
    ];
    const result = analyzeContent(items, 'igs');
    expect(result.status).toBe('Drift');
    expect(result.reason).toContain('Oversight.gov');
  });

  it('returns Warning with no items', () => {
    const result = analyzeContent([], 'fiscal');
    expect(result.status).toBe('Warning');
    expect(result.reason).toContain('Not enough information');
  });

  it('upgrades drift to capture with pattern language', () => {
    const items = [
      { title: 'Systematic reclassification of policy-influencing positions across agencies' },
    ];
    const result = analyzeContent(items, 'civilService');
    expect(result.status).toBe('Capture');
    expect(result.matches.some(m => m.includes('systematic pattern'))).toBe(true);
  });

  it('counts detail correctly', () => {
    const items = [
      { title: 'Workforce reduction in agency' },
      { title: 'Reorganization plan announced' },
    ];
    const result = analyzeContent(items, 'civilService');
    expect(result.detail?.warningCount).toBeGreaterThan(0);
    expect(result.detail?.itemsReviewed).toBe(2);
  });
});
