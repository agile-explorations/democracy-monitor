import { describe, expect, it } from 'vitest';
import {
  buildDegradationDetails,
  classifyDegradation,
  SEARCH_TIMING_THRESHOLDS,
} from '@/lib/services/search-timing-log';

const healthy = { embedMs: 800, expansionMs: 4000, retrieveWallMs: 7000, totalMs: 13000 };

describe('classifyDegradation (#727)', () => {
  it('returns null for a healthy prewarmed build', () => {
    expect(classifyDegradation(healthy)).toBeNull();
  });

  it('names every phase over its ceiling', () => {
    const reason = classifyDegradation({
      embedMs: 6000,
      expansionMs: 4000,
      retrieveWallMs: 40000,
      totalMs: 50000,
    });
    expect(reason).toContain(`embedMs=6000ms exceeds ${SEARCH_TIMING_THRESHOLDS.embedMs}ms`);
    expect(reason).toContain(
      `retrieveWallMs=40000ms exceeds ${SEARCH_TIMING_THRESHOLDS.retrieveWallMs}ms`,
    );
    expect(reason).toContain(`totalMs=50000ms exceeds ${SEARCH_TIMING_THRESHOLDS.totalMs}ms`);
    expect(reason).not.toContain('expansionMs=');
  });

  it('sits exactly at a ceiling without flagging', () => {
    expect(
      classifyDegradation({ ...healthy, totalMs: SEARCH_TIMING_THRESHOLDS.totalMs }),
    ).toBeNull();
  });
});

describe('buildDegradationDetails (#727)', () => {
  const record = {
    query: 'How did X compare to Y?',
    queryHash: 'abc123',
    params: { tier: null, eras: null, dateFrom: null, dateTo: null, refresh: false, debug: false },
    served: 'build' as const,
    embedMs: 900,
    expansionMs: 5000,
    retrieveWallMs: 40000,
    totalMs: 47000,
    windows: [
      { key: 'trump_t1', searchMs: 40000, rerankMs: 1500 },
      { key: 'trump_t2', searchMs: 22000, rerankMs: 1400 },
    ],
  };

  it('carries when, the exact search, phases, windows, and the release', () => {
    const details = buildDegradationDetails(
      record,
      'retrieveWallMs=40000ms exceeds 15000ms',
      new Date('2026-08-17T05:12:00Z'),
      0,
    );
    const joined = details.join('\n');
    expect(joined).toContain('2026-08-17T05:12:00.000Z (UTC Mon 05:12)');
    expect(joined).toContain('How did X compare to Y?');
    expect(joined).toContain('retrieveWallMs=40000ms exceeds 15000ms');
    expect(joined).toContain('trump_t1 search=40000ms');
    expect(joined).toContain('dump+prewarm 05:00');
    expect(joined).not.toContain('additional flagged');
  });

  it('reports builds suppressed by the alert cooldown', () => {
    const details = buildDegradationDetails(record, 'r', new Date(), 4);
    expect(details.join('\n')).toContain('4 additional flagged build(s)');
  });
});
