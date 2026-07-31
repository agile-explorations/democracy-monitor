import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isDbAvailable } from '@/lib/db';
import * as queries from '@/lib/services/funnel-validation-queries';
import {
  assembleSources,
  resolveWindow,
  runFunnelValidation,
} from '@/lib/services/funnel-validation-service';

vi.mock('@/lib/db', () => ({ isDbAvailable: vi.fn(() => true) }));
vi.mock('@/lib/services/funnel-validation-queries', () => ({
  queryRetrievedAndPassed: vi.fn(),
  queryFrDrops: vi.fn(),
  queryP1Flagged: vi.fn(),
  queryP2Confirmed: vi.fn(),
}));

describe('resolveWindow', () => {
  it('passes an explicit from/to through with days = null', () => {
    expect(resolveWindow({ from: '2020-01-01', to: '2020-06-01' })).toEqual({
      from: '2020-01-01',
      to: '2020-06-01',
      days: null,
    });
  });

  it('defaults to a 90-day window of valid date strings', () => {
    const w = resolveWindow({});
    expect(w.days).toBe(90);
    expect(w.from).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(w.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(w.from < w.to).toBe(true);
  });

  it('honors a custom --days', () => {
    expect(resolveWindow({ days: 30 }).days).toBe(30);
  });
});

describe('assembleSources', () => {
  it('sets retrieved/passed and maps null source_origin to "unknown"', () => {
    const sources = assembleSources(
      [{ category: 'c', sourceOrigin: null, retrieved: 100, passedRelevance: 80 }],
      [],
      [],
      [],
    );
    expect(sources).toEqual([
      {
        category: 'c',
        sourceOrigin: 'unknown',
        stages: { retrieved: 100, passedRelevance: 80, p1Flagged: 0, p2Confirmed: 0 },
      },
    ]);
  });

  it('adds FR live-drops to federal_register RETRIEVED without touching PASSED', () => {
    const sources = assembleSources(
      [
        {
          category: 'mediaFreedom',
          sourceOrigin: 'federal_register',
          retrieved: 200,
          passedRelevance: 200,
        },
      ],
      [{ category: 'mediaFreedom', dropped: 4000 }],
      [],
      [],
    );
    const fr = sources.find((s) => s.sourceOrigin === 'federal_register')!;
    expect(fr.stages.retrieved).toBe(4200); // 200 stored + 4000 live-dropped
    expect(fr.stages.passedRelevance).toBe(200); // drops never count as passed
  });

  it('creates a federal_register entry when the ledger has drops but nothing was stored', () => {
    const sources = assembleSources([], [{ category: 'mediaFreedom', dropped: 500 }], [], []);
    expect(sources).toEqual([
      {
        category: 'mediaFreedom',
        sourceOrigin: 'federal_register',
        stages: { retrieved: 500, passedRelevance: 0, p1Flagged: 0, p2Confirmed: 0 },
      },
    ]);
  });

  it('threads P1 and P2 counts onto the matching (category, source_origin)', () => {
    const sources = assembleSources(
      [{ category: 'c', sourceOrigin: 'doj', retrieved: 300, passedRelevance: 300 }],
      [],
      [{ category: 'c', sourceOrigin: 'doj', count: 45 }],
      [{ category: 'c', sourceOrigin: 'doj', count: 12 }],
    );
    expect(sources[0].stages).toEqual({
      retrieved: 300,
      passedRelevance: 300,
      p1Flagged: 45,
      p2Confirmed: 12,
    });
  });
});

describe('runFunnelValidation', () => {
  beforeEach(() => {
    vi.mocked(isDbAvailable).mockReturnValue(true);
    vi.mocked(queries.queryFrDrops).mockResolvedValue([]);
    vi.mocked(queries.queryP2Confirmed).mockResolvedValue([]);
  });

  it('assembles sources and flags a P1 collapse against a healthy sibling', async () => {
    vi.mocked(queries.queryRetrievedAndPassed).mockResolvedValue([
      {
        category: 'mediaFreedom',
        sourceOrigin: 'federal_register',
        retrieved: 4800,
        passedRelevance: 4800,
      },
      { category: 'mediaFreedom', sourceOrigin: 'gdelt', retrieved: 1200, passedRelevance: 1200 },
    ]);
    vi.mocked(queries.queryP1Flagged).mockResolvedValue([
      { category: 'mediaFreedom', sourceOrigin: 'gdelt', count: 130 },
    ]);

    const report = await runFunnelValidation({ days: 90 });
    expect(report.sources).toHaveLength(2);
    expect(report.collapses).toHaveLength(1);
    expect(report.collapses[0]).toMatchObject({
      sourceOrigin: 'federal_register',
      stage: 'p1',
      severity: 'error',
    });
  });

  it('throws when the database is unavailable', async () => {
    vi.mocked(isDbAvailable).mockReturnValue(false);
    await expect(runFunnelValidation()).rejects.toThrow('DATABASE_URL not configured');
  });
});
