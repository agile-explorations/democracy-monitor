import { describe, it, expect } from 'vitest';
import { isElevatedStatus, buildStableTemplate } from '@/lib/services/narrative-generation-service';
import type { ConvergenceSynthesis } from '@/lib/types/structural';

function makeConvergence(
  status: ConvergenceSynthesis['status'],
  layersElevated = 0,
): ConvergenceSynthesis {
  return {
    status,
    structuralElevated: layersElevated > 0,
    aiElevated: layersElevated > 1,
    thematicElevated: layersElevated > 2,
    layersElevated,
    pattern: 'test pattern',
    bootstrap: false,
  };
}

describe('isElevatedStatus', () => {
  it('returns false for null convergence detail', () => {
    expect(isElevatedStatus(null)).toBe(false);
  });

  it('returns false for Stable status', () => {
    expect(isElevatedStatus(makeConvergence('Stable'))).toBe(false);
  });

  it('returns true for Elevated status', () => {
    expect(isElevatedStatus(makeConvergence('Elevated', 1))).toBe(true);
  });

  it('returns true for Divergent status (legacy)', () => {
    expect(isElevatedStatus(makeConvergence('Divergent', 2))).toBe(true);
  });

  it('returns true for ConfirmedConcern status', () => {
    expect(isElevatedStatus(makeConvergence('ConfirmedConcern', 2))).toBe(true);
  });
});

describe('buildStableTemplate', () => {
  it('returns a template with category title and date', () => {
    const result = buildStableTemplate('Government Worker Protections', '2026-02-17');
    expect(result.expert).toContain('Government Worker Protections');
    expect(result.expert).toContain('2026-02-17');
    expect(result.expert).toContain('No significant structural');
    expect(result.model).toBe('template');
  });

  it('returns identical expert and public content', () => {
    const result = buildStableTemplate('Test Category', '2026-01-01');
    expect(result.expert).toBe(result.public);
  });
});
