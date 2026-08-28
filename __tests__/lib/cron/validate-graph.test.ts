import { describe, expect, it, vi } from 'vitest';
import {
  describeUnscoredDoc,
  findOrphanCategories,
  LIVE_INVARIANT_IDS,
  runGraphValidation,
  runLiveInvariants,
} from '@/lib/cron/validate-graph';

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

describe('runLiveInvariants (#650)', () => {
  it('runs only the cheap live-tier invariants (no heavy doc/score scans)', async () => {
    const results = await runLiveInvariants();
    const ids = results.map((r) => r.id).sort();
    expect(ids).toEqual([...LIVE_INVARIANT_IDS].sort());
    // Heavy invariants (G1a/G1b/G5/G6) are NOT run live.
    expect(ids).not.toContain('G1a');
    expect(ids).not.toContain('G6');
    expect(results.every((r) => r.pass && r.violations === 0)).toBe(true);
  });
});

describe('describeUnscoredDoc (G1a samples, #667)', () => {
  it('renders id, category, origin and publish date so a hold names its documents', () => {
    expect(
      describeUnscoredDoc({
        id: 2045265,
        category: 'civilService',
        source_origin: 'legiscan',
        published_at: '2026-07-15T07:00:00.000Z',
      }),
    ).toBe('#2045265 civilService legiscan 2026-07-15');
  });

  it('tolerates a missing origin', () => {
    expect(
      describeUnscoredDoc({ id: 1, category: 'fiscal', source_origin: null, published_at: null }),
    ).toBe('#1 fiscal unknown-origin ');
  });
});
