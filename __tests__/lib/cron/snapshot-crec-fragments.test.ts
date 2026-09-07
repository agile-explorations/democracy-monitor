import { describe, expect, it } from 'vitest';
import { describeFragmentBuild, tryBuildCrecFragments } from '@/lib/cron/snapshot-crec-fragments';
import type { CrecFragmentBuildResult } from '@/lib/cron/snapshot-crec-fragments';

const ok: CrecFragmentBuildResult = { candidates: 3, processed: 3, inserted: 61, misses: 0 };

/** Behaves like the real builder: only a confirmed run with a key does work. */
async function fakeBuild(options: { confirm: boolean; apiKey?: string }) {
  if (!options.confirm || !options.apiKey) throw new Error('dry run — nothing built');
  return ok;
}

describe('snapshot CREC fragment step (#852)', () => {
  it('builds in confirm mode with the configured key and records nothing on success', async () => {
    const errors: string[] = [];
    const result = await tryBuildCrecFragments(errors, { apiKey: 'k', build: fakeBuild });
    expect(result).toEqual(ok);
    expect(errors).toEqual([]);
  });

  it('reports fetch misses as a run advisory so the leftover is visible', async () => {
    const errors: string[] = [];
    const withMiss = { ...ok, processed: 2, misses: 1 };
    const result = await tryBuildCrecFragments(errors, {
      apiKey: 'k',
      build: async () => withMiss,
    });
    expect(result).toEqual(withMiss);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('1 fetch miss');
    expect(errors[0]).toContain('retried next run');
  });

  it('is non-fatal: a thrown build error is recorded, not propagated', async () => {
    const errors: string[] = [];
    const result = await tryBuildCrecFragments(errors, {
      apiKey: 'k',
      build: async () => {
        throw new Error('govinfo down');
      },
    });
    expect(result).toBeNull();
    expect(errors).toEqual(['CREC fragment build failed: govinfo down']);
  });

  it('skips cleanly when no GovInfo key is configured (nothing built, no error)', async () => {
    const errors: string[] = [];
    const result = await tryBuildCrecFragments(errors, { apiKey: undefined, build: fakeBuild });
    expect(result).toBeNull();
    expect(errors).toEqual([]);
  });

  it('summarises the build for the run log', () => {
    expect(describeFragmentBuild(ok)).toBe(
      'CREC fragments: 3 candidate granule(s) → 3 processed, 61 fragment rows, 0 fetch miss(es)',
    );
  });
});
