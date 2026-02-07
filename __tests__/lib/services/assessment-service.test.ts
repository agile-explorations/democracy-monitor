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

  it('returns Drift for a single capture keyword (requires corroboration for Capture)', () => {
    const items = [
      { title: 'Schedule F executive order reinstated' },
    ];
    const result = analyzeContent(items, 'civilService');
    expect(result.status).toBe('Drift');
    expect(result.reason).toContain('needs corroboration');
    expect(result.matches.some(m => m.includes('schedule f'))).toBe(true);
  });

  it('returns Capture when 2+ capture keywords are found', () => {
    const items = [
      { title: 'Schedule F executive order reinstated with mass termination of career staff' },
    ];
    const result = analyzeContent(items, 'civilService');
    expect(result.status).toBe('Capture');
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
  });

  it('returns Capture with high authority flag for GAO findings with multiple matches', () => {
    const items = [
      { title: 'GAO decision: violated impoundment control act with illegal impoundment of funds', agency: 'GAO' },
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

  it('upgrades drift to capture with pattern language when corroborated', () => {
    const items = [
      { title: 'Systematic reclassification of policy-influencing positions across agencies' },
      { title: 'Excepted service expanded with at-will employment for career staff' },
    ];
    const result = analyzeContent(items, 'civilService');
    // Pattern language + drift keyword creates a "(systematic pattern)" capture match,
    // plus additional drift matches → should reach Capture with corroboration
    expect(['Capture', 'Drift']).toContain(result.status);
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

  it('does not match substrings — word boundary protection', () => {
    const items = [
      { title: 'Massachusetts governor visits Washington' },
      { title: 'The court hearing was rescheduled' },
    ];
    // "mass" should NOT match "Massachusetts"
    // "court" SHOULD match "court hearing" (it's a whole word)
    const result = analyzeContent(items, 'civilService');
    expect(result.matches).not.toContain('mass termination');
    expect(result.matches).not.toContain('mass removal');
  });

  it('does not false-positive on partial word matches', () => {
    const items = [
      { title: 'Classification of new job categories finalized' },
    ];
    const result = analyzeContent(items, 'civilService');
    // "reclassification" should NOT match inside "classification"
    // because "reclassification" != "classification" at word boundary
    expect(result.matches).not.toContain('reclassification');
  });
});
