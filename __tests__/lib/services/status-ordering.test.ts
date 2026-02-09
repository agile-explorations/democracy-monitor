import { describe, it, expect } from 'vitest';
import {
  statusIndex,
  statusDistance,
  isDowngrade,
  clampToCeiling,
  resolveDowngrade,
} from '@/lib/services/status-ordering';

describe('statusIndex', () => {
  it('returns 0 for Stable', () => {
    expect(statusIndex('Stable')).toBe(0);
  });

  it('returns 1 for Warning', () => {
    expect(statusIndex('Warning')).toBe(1);
  });

  it('returns 2 for Drift', () => {
    expect(statusIndex('Drift')).toBe(2);
  });

  it('returns 3 for Capture', () => {
    expect(statusIndex('Capture')).toBe(3);
  });
});

describe('statusDistance', () => {
  it('returns 0 for same status', () => {
    expect(statusDistance('Warning', 'Warning')).toBe(0);
  });

  it('returns 1 for adjacent statuses', () => {
    expect(statusDistance('Stable', 'Warning')).toBe(1);
    expect(statusDistance('Warning', 'Stable')).toBe(1);
  });

  it('is symmetric', () => {
    expect(statusDistance('Stable', 'Drift')).toBe(statusDistance('Drift', 'Stable'));
  });

  it('returns 3 for extreme pair', () => {
    expect(statusDistance('Stable', 'Capture')).toBe(3);
  });
});

describe('isDowngrade', () => {
  it('returns true when recommended is lower than ceiling', () => {
    expect(isDowngrade('Warning', 'Stable')).toBe(true);
    expect(isDowngrade('Capture', 'Drift')).toBe(true);
  });

  it('returns false for same status', () => {
    expect(isDowngrade('Warning', 'Warning')).toBe(false);
  });

  it('returns false when recommended is higher than ceiling', () => {
    expect(isDowngrade('Stable', 'Warning')).toBe(false);
  });
});

describe('clampToCeiling', () => {
  it('returns ceiling when recommended is above', () => {
    expect(clampToCeiling('Warning', 'Capture')).toBe('Warning');
  });

  it('returns recommended when at ceiling', () => {
    expect(clampToCeiling('Drift', 'Drift')).toBe('Drift');
  });

  it('returns recommended when below ceiling', () => {
    expect(clampToCeiling('Capture', 'Warning')).toBe('Warning');
  });
});

describe('resolveDowngrade', () => {
  it('returns no downgrade, no flag when statuses match', () => {
    const result = resolveDowngrade('Warning', 'Warning', 0.9);
    expect(result.finalStatus).toBe('Warning');
    expect(result.downgradeApplied).toBe(false);
    expect(result.flaggedForReview).toBe(false);
  });

  it('auto-accepts 1-level downgrade with confidence >= 0.7', () => {
    const result = resolveDowngrade('Drift', 'Warning', 0.7);
    expect(result.finalStatus).toBe('Warning');
    expect(result.downgradeApplied).toBe(true);
    expect(result.flaggedForReview).toBe(false);
  });

  it('flags for review 1-level downgrade with confidence < 0.7', () => {
    const result = resolveDowngrade('Drift', 'Warning', 0.69);
    expect(result.finalStatus).toBe('Drift');
    expect(result.downgradeApplied).toBe(false);
    expect(result.flaggedForReview).toBe(true);
  });

  it('flags for review 2-level downgrade even with high confidence', () => {
    const result = resolveDowngrade('Capture', 'Warning', 0.95);
    expect(result.finalStatus).toBe('Capture');
    expect(result.downgradeApplied).toBe(false);
    expect(result.flaggedForReview).toBe(true);
  });

  it('flags for review 3-level downgrade (Capture to Stable)', () => {
    const result = resolveDowngrade('Capture', 'Stable', 0.9);
    expect(result.finalStatus).toBe('Capture');
    expect(result.downgradeApplied).toBe(false);
    expect(result.flaggedForReview).toBe(true);
  });

  it('clamps AI recommendation above keyword to keyword level (treated as same)', () => {
    // AI recommends Capture but keyword says Warning — clamp first, then resolve
    // Since clampToCeiling is called before resolveDowngrade in ai-assessment-service,
    // here we pass the already-clamped value
    const result = resolveDowngrade('Warning', 'Warning', 0.8);
    expect(result.finalStatus).toBe('Warning');
    expect(result.downgradeApplied).toBe(false);
    expect(result.flaggedForReview).toBe(false);
  });
});
