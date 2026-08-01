import { describe, expect, it, vi } from 'vitest';
import { findOrphanCategories, runGraphValidation } from '@/lib/cron/validate-graph';

const mockExecute = vi.fn().mockResolvedValue({ rows: [] });
vi.mock('@/lib/db', () => ({
  isDbAvailable: vi.fn().mockReturnValue(true),
  getDb: vi.fn(() => ({ execute: mockExecute })),
}));

describe('findOrphanCategories (G6, #647)', () => {
  it('flags a genuinely unknown category', () => {
    expect(findOrphanCategories(['civilLiberties', 'bogus', 'elections'])).toEqual(['bogus']);
  });

  it('does NOT flag the presidential-intent pseudo-category', () => {
    expect(findOrphanCategories(['intent', 'elections'])).toEqual([]);
  });

  it('returns empty when every category is a valid detection key', () => {
    expect(findOrphanCategories(['civilLiberties', 'elections'])).toEqual([]);
  });
});

describe('runGraphValidation', () => {
  it('runs the full edge contract and passes on empty data (incl. the new G6)', async () => {
    const results = await runGraphValidation();
    const ids = results.map((r) => r.id);
    // Every invariant reports; G6 (orphan categories, #647) is now part of the contract.
    expect(ids).toContain('G1a');
    expect(ids).toContain('G4h');
    expect(ids).toContain('G6');
    // Empty data means no violations anywhere.
    expect(results.every((r) => r.pass && r.violations === 0)).toBe(true);
    // Each result carries a severity for gating.
    expect(results.every((r) => r.severity === 'error' || r.severity === 'warn')).toBe(true);
  });
});
