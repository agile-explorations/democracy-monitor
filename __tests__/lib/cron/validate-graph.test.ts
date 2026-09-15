import { describe, expect, it, vi } from 'vitest';
import {
  describeParityMismatch,
  describeUnscoredDoc,
  findCountParityMismatches,
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

describe('findOrphanCategories (G6, #647 / #893)', () => {
  const inTable = (table: string, ...categories: string[]) =>
    categories.map((category) => ({ table, category }));

  it('flags a genuinely unknown category, naming the table it sits in', () => {
    expect(
      findOrphanCategories(inTable('document_scores', 'civilLiberties', 'bogus', 'elections')),
    ).toEqual(['document_scores: bogus']);
  });

  it('does NOT flag the presidential-intent pseudo-category in any table', () => {
    expect(
      findOrphanCategories([
        ...inTable('documents', 'intent'),
        ...inTable('document_scores', 'intent'),
        ...inTable('weekly_aggregates', 'intent'),
        ...inTable('baselines', 'intent', 'elections'),
      ]),
    ).toEqual([]);
  });

  it('allows corpus in documents only — a corpus row in any derived table is an orphan', () => {
    expect(findOrphanCategories(inTable('documents', 'corpus'))).toEqual([]);
    expect(
      findOrphanCategories([
        ...inTable('document_scores', 'corpus'),
        ...inTable('weekly_aggregates', 'corpus'),
        ...inTable('baselines', 'corpus'),
      ]),
    ).toEqual(['document_scores: corpus', 'weekly_aggregates: corpus', 'baselines: corpus']);
  });

  it('returns empty when every category is a valid detection key', () => {
    expect(findOrphanCategories(inTable('documents', 'civilLiberties', 'elections'))).toEqual([]);
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
    // #825: assessment-week parity (G7, G7n) and the baseline split of G2b.
    expect(ids).toContain('G7');
    expect(ids).toContain('G7n');
    expect(ids).toContain('G2b-baseline');
    expect(results.find((r) => r.id === 'G7')?.severity).toBe('error');
    expect(results.find((r) => r.id === 'G7n')?.severity).toBe('warn');
    expect(results.find((r) => r.id === 'G2b-baseline')?.severity).toBe('warn');
    expect(results.find((r) => r.id === 'G2b')?.severity).toBe('error');
    // #893: population-flag consistency across the three document populations.
    expect(ids).toContain('G8');
    expect(results.find((r) => r.id === 'G8')?.severity).toBe('error');
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
    // Heavy invariants (G1a/G1b/G5/G6) are NOT run live; G8 is index-bound and is.
    expect(ids).not.toContain('G1a');
    expect(ids).not.toContain('G6');
    expect(ids).toContain('G8');
    expect(results.every((r) => r.pass && r.violations === 0)).toBe(true);
  });

  it('G8 (#893) sums its three clauses and samples only the violating ones', async () => {
    // G8 runs last in the live tier: the first eight executes feed G2a..G4h,
    // then one execute per G8 clause.
    const empty = { rows: [] };
    mockExecute.mockReset();
    for (let i = 0; i < 8; i++) mockExecute.mockResolvedValueOnce(empty);
    mockExecute
      .mockResolvedValueOnce({ rows: [{ n: '2', ids: [11, 12] }] }) // superseded still evidence
      .mockResolvedValueOnce({ rows: [{ n: '0', ids: null }] }) // corpus flags
      .mockResolvedValueOnce({ rows: [{ n: '1', ids: [13] }] }); // superseded without successor
    const g8 = (await runLiveInvariants()).find((r) => r.id === 'G8');
    mockExecute.mockResolvedValue(empty);
    expect(g8).toMatchObject({ severity: 'error', violations: 3, pass: false });
    expect(g8?.sample).toEqual([
      'superseded revision still analysis evidence: 2 (e.g. #11, #12)',
      'superseded revision without metadata.supersededBy: 1 (e.g. #13)',
    ]);
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

describe('findCountParityMismatches (G2b population, #825)', () => {
  it('maps driver rows to typed category-weeks with both counts', async () => {
    mockExecute.mockResolvedValueOnce({
      rows: [{ category: 'executiveOversight', w: '2026-08-03', agg_count: '61', score_count: 62 }],
    });
    const rows = await findCountParityMismatches({ from: '2025-01-20' });
    expect(rows).toEqual([
      { category: 'executiveOversight', weekOf: '2026-08-03', aggCount: 61, scoreCount: 62 },
    ]);
    expect(describeParityMismatch(rows[0])).toBe('executiveOversight 2026-08-03: agg=61 scores=62');
  });
});
