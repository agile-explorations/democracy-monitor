import { describe, it, expect } from 'vitest';
import { GOVERNANCE_FRAMEWORK, classifyGovernance } from '@/lib/data/governance-framework';

describe('GOVERNANCE_FRAMEWORK', () => {
  it('has 5 governance categories', () => {
    expect(GOVERNANCE_FRAMEWORK).toHaveLength(5);
  });

  it('each entry has required fields', () => {
    for (const entry of GOVERNANCE_FRAMEWORK) {
      expect(entry.key).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(entry.indicators.length).toBeGreaterThan(0);
      expect(entry.scoreRange).toHaveLength(2);
      expect(entry.scoreRange[0]).toBeLessThanOrEqual(entry.scoreRange[1]);
    }
  });

  it('categories are ordered from democratic to authoritarian', () => {
    const keys = GOVERNANCE_FRAMEWORK.map((e) => e.key);
    expect(keys[0]).toBe('liberal_democracy');
    expect(keys[keys.length - 1]).toBe('personalist_rule');
  });
});

describe('classifyGovernance', () => {
  it('classifies strongly negative score as liberal_democracy', () => {
    const result = classifyGovernance(-2);
    expect(result.key).toBe('liberal_democracy');
  });

  it('classifies score near 0 as competitive_authoritarian', () => {
    const result = classifyGovernance(0);
    expect(result.key).toBe('competitive_authoritarian');
  });

  it('classifies score of 1 as executive_dominant', () => {
    const result = classifyGovernance(1);
    expect(result.key).toBe('executive_dominant');
  });

  it('classifies score of 2 as personalist_rule', () => {
    const result = classifyGovernance(2);
    expect(result.key).toBe('personalist_rule');
  });

  it('handles extreme negative values by defaulting to liberal_democracy', () => {
    const result = classifyGovernance(-10);
    expect(result.key).toBe('liberal_democracy');
  });

  it('handles extreme positive values by defaulting to personalist_rule', () => {
    const result = classifyGovernance(10);
    expect(result.key).toBe('personalist_rule');
  });

  it('returns matching entry with correct label', () => {
    const result = classifyGovernance(0.3);
    expect(result.label).toBeTruthy();
    expect(result.description).toBeTruthy();
  });
});
