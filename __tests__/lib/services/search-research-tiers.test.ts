/**
 * Seed DAG contract (#782 WO-5): the overlap must change scheduling only.
 * Every stage still receives exactly the inputs the serial seed gave it,
 * and the independent stages really do run before expansion resolves.
 *
 * The collaborators are stubbed so that each stage's OUTPUT encodes the
 * inputs it received (alias phrases carry the tier, mined phrases carry the
 * `existing` set) — the assertions read the seed's returned documents, not
 * the stubs' call logs.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { extractMiningPhrases, validateAndRunMined } from '@/lib/services/entity-mining';
import { expandAndValidate } from '@/lib/services/query-expansion-service';
import { fuseHydrateDedupe, runArmsForAliases } from '@/lib/services/research-fusion';
import {
  searchResearchAllTiers,
  searchSingleTierWithMeta,
} from '@/lib/services/search-research-tiers';
import { executeFilteredVectorQuery } from '@/lib/services/vector-expr';

vi.mock('@/lib/services/query-expansion-service', () => ({ expandAndValidate: vi.fn() }));
vi.mock('@/lib/services/vector-expr', () => ({ executeFilteredVectorQuery: vi.fn() }));
vi.mock('@/lib/services/entity-mining', () => ({
  extractMiningPhrases: vi.fn(),
  validateAndRunMined: vi.fn(),
}));
vi.mock('@/lib/services/research-fusion', () => ({
  runArmsForAliases: vi.fn(),
  fuseHydrateDedupe: vi.fn(),
  attachMatchSnippets: vi.fn(async (docs: unknown[]) => docs),
  armsForTier: vi.fn((arms: unknown[]) => arms),
}));
vi.mock('@/lib/services/research-retrieval', () => ({
  buildResearchQuery: vi.fn((_v: string, _q: string, opts: { tier: string }) => opts),
}));
vi.mock('@/lib/services/search-service', () => ({
  mapToResearchDoc: vi.fn((row: { id: number }) => ({ id: row.id })),
}));
vi.mock('@/lib/data/document-tiers', () => ({
  composeTieredResults: vi.fn((a: unknown[], d: unknown[]) => [...a, ...d]),
}));

type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

const LLM = [{ phrase: 'schedule f', matches: 10 }];
const EXTRA = [{ phrase: 'opm rule', matches: 5 }];

/** Observations the stubs record as plain state (what ran, and when). */
const seen = {
  vectorQueries: 0,
  extractionRan: false,
  minedExisting: undefined as string | undefined,
};

beforeEach(() => {
  seen.vectorQueries = 0;
  seen.extractionRan = false;
  seen.minedExisting = undefined;
  vi.mocked(executeFilteredVectorQuery).mockImplementation(async (_db, opts) => {
    seen.vectorQueries++;
    const { tier } = opts as unknown as { tier: string };
    return { rows: [{ id: tier === 'action' ? 1 : 2 }] } as never;
  });
  vi.mocked(extractMiningPhrases).mockImplementation(async (rows) => {
    seen.extractionRan = true;
    return [{ phrase: `mined-from-${rows.map((r) => r.id).join('+')}` }] as never;
  });
  vi.mocked(validateAndRunMined).mockImplementation(async (extracted, existing, window) => {
    const existingKey = existing.map((a) => a.phrase).join('+');
    seen.minedExisting = existingKey;
    const phrase = `${extracted.map((e) => e.phrase).join(',')}|${existingKey}|${window.tier ?? 'all'}`;
    return {
      minedAliases: [{ phrase, matches: 3 }],
      minedArms: [{ items: [{ id: 900, sourceType: 's', matchedAlias: phrase }], weight: 1 }],
    };
  });
  vi.mocked(runArmsForAliases).mockImplementation(async (aliases, _from, _to, tier) =>
    aliases.map((a, i) => ({
      items: [{ id: 100 + i, sourceType: 's', matchedAlias: `${a.phrase}@${tier ?? 'all'}` }],
      weight: 1,
    })),
  );
  // Fusion stub: primary docs first, then every arm's hits in arm order —
  // so the returned documents expose the arm order and each arm's inputs.
  vi.mocked(fuseHydrateDedupe).mockImplementation(
    async (primary, arms) =>
      [
        ...primary,
        ...arms.flatMap((a) => a.items.map((h) => ({ id: h.id, matchedAlias: h.matchedAlias }))),
      ] as never,
  );
});

const aliasesOf = (docs: Array<{ matchedAlias?: string }>) => docs.map((d) => d.matchedAlias);

describe('seed DAG (#782 WO-5)', () => {
  it('runs the vector queries and mining extraction while expansion is still pending', async () => {
    const expansion = deferred<typeof LLM>();
    vi.mocked(expandAndValidate).mockReturnValue(expansion.promise);
    const run = searchResearchAllTiers({} as never, 'q', '[0]', 10);
    await tick();
    expect(seen.vectorQueries).toBe(2);
    expect(seen.extractionRan).toBe(true);
    expect(seen.minedExisting).toBeUndefined(); // the known-filter waits for the aliases
    expansion.resolve(LLM);
    const out = await run;
    expect(seen.minedExisting).toBe('schedule f');
    expect(out.minedAliases[0].phrase).toBe('mined-from-1+2|schedule f|all');
  });

  it('gives mined validation the validated LLM aliases plus the extra aliases, in that order', async () => {
    vi.mocked(expandAndValidate).mockResolvedValue(LLM);
    const out = await searchResearchAllTiers(
      {} as never,
      'q',
      '[0]',
      10,
      '2025-01-20',
      undefined,
      EXTRA,
    );
    expect(out.minedAliases[0].phrase).toBe('mined-from-1+2|schedule f+opm rule|all');
  });

  it('fuses arms in the serial order [llm, mined, extra] for both tier pools', async () => {
    vi.mocked(expandAndValidate).mockResolvedValue(LLM);
    const out = await searchResearchAllTiers(
      {} as never,
      'q',
      '[0]',
      10,
      undefined,
      undefined,
      EXTRA,
    );
    const mined = 'mined-from-1+2|schedule f+opm rule|all';
    expect(aliasesOf(out.documents)).toEqual([
      undefined, // action vector doc 1
      'schedule f@all',
      mined,
      'opm rule@all',
      undefined, // discussion vector doc 2
      'schedule f@all',
      mined,
      'opm rule@all',
    ]);
  });

  it('degrades to vector + mined arms when expansion yields nothing', async () => {
    vi.mocked(expandAndValidate).mockResolvedValue([]);
    const out = await searchResearchAllTiers({} as never, 'q', '[0]', 10);
    expect(out.documents.map((d) => d.id)).toEqual([1, 900, 2, 900]);
    expect(out.minedAliases[0].phrase).toBe('mined-from-1+2||all');
  });

  it('single-tier path scopes expansion, arms, and mining to that tier', async () => {
    vi.mocked(expandAndValidate).mockImplementation(async (_q, w) => [
      { phrase: `llm:${w.tier}`, matches: 1 },
    ]);
    const out = await searchSingleTierWithMeta(
      {} as never,
      'q',
      '[0]',
      10,
      undefined,
      undefined,
      'discussion',
    );
    expect(aliasesOf(out.documents)).toEqual([
      undefined,
      'llm:discussion@discussion',
      'mined-from-2|llm:discussion|discussion',
    ]);
  });

  it('records the new stage rows when a sink is supplied', async () => {
    vi.mocked(expandAndValidate).mockResolvedValue(LLM);
    const sink: Array<{ key: string }> = [];
    await searchResearchAllTiers(
      {} as never,
      'q',
      '[0]',
      10,
      undefined,
      undefined,
      undefined,
      undefined,
      sink as never,
    );
    const keys = sink.map((s) => s.key);
    for (const k of [
      'seed-expansion',
      'seed-vector-action',
      'seed-vector-discussion',
      'seed-mining-prep',
      'seed-alias-arms',
      'seed-mining',
      'seed-fuse-hydrate',
    ]) {
      expect(keys).toContain(k);
    }
  });

  it('still fails the build when a vector query fails, without an unhandled rejection', async () => {
    const expansion = deferred<typeof LLM>();
    vi.mocked(expandAndValidate).mockReturnValue(expansion.promise);
    vi.mocked(executeFilteredVectorQuery).mockRejectedValue(new Error('db down'));
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    try {
      const run = searchResearchAllTiers({} as never, 'q', '[0]', 10);
      await tick();
      expansion.resolve(LLM);
      await expect(run).rejects.toThrow('db down');
      await tick();
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
  });
});
