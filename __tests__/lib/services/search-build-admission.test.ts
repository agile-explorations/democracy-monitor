/**
 * Admission chain (#792 #793 #794): rejections write the right response and
 * roll back what they claimed; an admitted build releases everything. The
 * layers are stateful fakes — assertions read what each layer HOLDS.
 */
import type { NextApiResponse } from 'next';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  admitBuild,
  admitStream,
  releaseBuild,
  releaseStream,
} from '@/lib/services/search-build-admission';

const state = vi.hoisted(() => ({
  hash: 0,
  global: 0,
  source: 0,
  refuse: { hash: false, global: false, source: false },
  spend: { ok: true } as { ok: boolean; scope?: string; code?: string },
}));
type Res = { status: (c: number) => { json: (b: unknown) => void } };
vi.mock('@/lib/services/search-docs-response', () => ({
  claimBuildSlot: vi.fn(async () => (state.refuse.hash ? false : (state.hash++, true))),
  claimGlobalBuildSlot: vi.fn(async () => (state.refuse.global ? null : (state.global++, 0))),
  releaseBuildSlot: vi.fn(() => {
    state.hash--;
  }),
  releaseGlobalBuildSlot: vi.fn(() => {
    state.global--;
  }),
  respondBuilding: vi.fn((res: Res) => res.status(202).json({ status: 'building' })),
}));
vi.mock('@/lib/services/search-source-slots', () => ({
  claimSourceSlot: vi.fn(async () => (state.refuse.source ? false : (state.source++, true))),
  releaseSourceSlot: vi.fn(async () => {
    state.source--;
  }),
  respondSourceBusy: vi.fn((res: Res) => res.status(429).json({ code: 'source_busy' })),
}));
vi.mock('@/lib/services/search-spend-budget', () => ({
  admitSpend: vi.fn(async () => state.spend),
  respondSpend: vi.fn((res: Res, v: { code: string }) =>
    res.status(v.code === 'search_paused' ? 503 : 429).json({ code: v.code }),
  ),
}));

const res = () => {
  const r = {
    statusCode: 0,
    body: undefined as unknown,
    status(c: number) {
      this.statusCode = c;
      return this;
    },
    json(p: unknown) {
      this.body = p;
      return this;
    },
  };
  return r as unknown as NextApiResponse & { statusCode: number; body: { code?: string } };
};
const source = { kind: 'human' as const, id: 'pass:a' };
const held = () => ({ hash: state.hash, global: state.global, source: state.source });

beforeEach(() => {
  state.hash = 0;
  state.global = 0;
  state.source = 0;
  state.refuse = { hash: false, global: false, source: false };
  state.spend = { ok: true };
});

describe('admitBuild', () => {
  it('admits a coalesced build and releases every slot on release', async () => {
    const a = await admitBuild(res(), source, 'h', true);
    expect(a).toMatchObject({ globalSlot: 0, coalesce: true, sourceId: 'pass:a' });
    expect(held()).toEqual({ hash: 1, global: 1, source: 1 });
    releaseBuild(a!);
    expect(held()).toEqual({ hash: 0, global: 0, source: 0 });
  });

  it('202s and holds nothing when the question is already building', async () => {
    state.refuse.hash = true;
    const r = res();
    expect(await admitBuild(r, source, 'h', true)).toBeNull();
    expect(r.statusCode).toBe(202);
    expect(held()).toEqual({ hash: 0, global: 0, source: 0 });
  });

  it('202s and releases the hash slot when the global slots are full', async () => {
    state.refuse.global = true;
    const r = res();
    expect(await admitBuild(r, source, 'h', true)).toBeNull();
    expect(r.statusCode).toBe(202);
    expect(held()).toEqual({ hash: 0, global: 0, source: 0 });
  });

  it('rolls back the queue slots when the source is busy', async () => {
    state.refuse.source = true;
    const r = res();
    expect(await admitBuild(r, source, 'h', true)).toBeNull();
    expect(r.statusCode).toBe(429);
    expect(r.body.code).toBe('source_busy');
    expect(held()).toEqual({ hash: 0, global: 0, source: 0 });
  });

  it('rolls back everything when the budget rejects, with the right status', async () => {
    state.spend = { ok: false, scope: 'global', code: 'search_paused' };
    const r = res();
    expect(await admitBuild(r, source, 'h', true)).toBeNull();
    expect(r.statusCode).toBe(503);
    expect(held()).toEqual({ hash: 0, global: 0, source: 0 });
  });

  it('non-coalesced builds (debug, full synthesis) skip the queue slots but still pay source + spend', async () => {
    const a = await admitBuild(res(), source, 'h', false);
    expect(a).toMatchObject({ globalSlot: null, coalesce: false });
    expect(held()).toEqual({ hash: 0, global: 0, source: 1 });
    releaseBuild(a!);
    expect(held().source).toBe(0);
  });
});

describe('admitStream', () => {
  it('admits within limits and releases on release', async () => {
    expect(await admitStream(res(), source)).toBe(true);
    expect(held().source).toBe(1);
    releaseStream(source);
    expect(held().source).toBe(0);
  });

  it('returns a per-source budget rejection without holding the slot', async () => {
    state.spend = { ok: false, scope: 'source', code: 'daily_budget' };
    const r = res();
    expect(await admitStream(r, source)).toBe(false);
    expect(r.statusCode).toBe(429);
    expect(held().source).toBe(0);
  });
});
