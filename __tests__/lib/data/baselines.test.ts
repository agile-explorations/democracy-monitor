import { describe, expect, it } from 'vitest';
import { BASELINE_CONFIGS, getBaselineConfigForCycleYear } from '@/lib/data/baselines';

describe('getBaselineConfigForCycleYear', () => {
  it('returns biden_2021 for cycle year 1', () => {
    const config = getBaselineConfigForCycleYear(1);
    expect(config?.id).toBe('biden_2021');
    expect(config?.cycleYear).toBe(1);
  });

  it('returns biden_2022 for cycle year 2', () => {
    const config = getBaselineConfigForCycleYear(2);
    expect(config?.id).toBe('biden_2022');
    expect(config?.cycleYear).toBe(2);
  });

  it('falls back to first Biden baseline for unmatched cycle year', () => {
    const config = getBaselineConfigForCycleYear(3);
    expect(config?.administration).toBe('biden');
  });

  it('all baseline configs have required fields', () => {
    for (const config of BASELINE_CONFIGS) {
      expect(config.cycleYear).toBeGreaterThanOrEqual(1);
      expect(config.cycleYear).toBeLessThanOrEqual(4);
      expect(config.administration).toBeTruthy();
      expect(config.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(config.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
