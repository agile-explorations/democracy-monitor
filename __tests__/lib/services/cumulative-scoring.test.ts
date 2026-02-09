import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isDbAvailable, getDb } from '@/lib/db';
import {
  computeCumulativeFromWeeks,
  computeCumulativeScores,
  computeAllCumulativeScores,
} from '@/lib/services/cumulative-scoring';

vi.mock('@/lib/db', () => ({
  getDb: vi.fn(),
  isDbAvailable: vi.fn(),
}));

const mockIsDbAvailable = vi.mocked(isDbAvailable);
const mockGetDb = vi.mocked(getDb);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('computeCumulativeFromWeeks (pure function)', () => {
  it('returns zeroes for empty input', () => {
    const result = computeCumulativeFromWeeks('courts', [], 8);

    expect(result.category).toBe('courts');
    expect(result.runningSum).toBe(0);
    expect(result.runningAverage).toBe(0);
    expect(result.weekCount).toBe(0);
    expect(result.highWaterMark).toBe(0);
    expect(result.currentWeekScore).toBe(0);
    expect(result.decayWeightedScore).toBe(0);
    expect(result.decayHalfLifeWeeks).toBe(8);
  });

  it('computes running sum', () => {
    const weeks = [
      { weekOf: '2025-01-20', totalSeverity: 10 },
      { weekOf: '2025-01-27', totalSeverity: 25 },
      { weekOf: '2025-02-03', totalSeverity: 15 },
      { weekOf: '2025-02-10', totalSeverity: 20 },
    ];

    const result = computeCumulativeFromWeeks('courts', weeks, 8);

    expect(result.runningSum).toBe(70);
    expect(result.weekCount).toBe(4);
  });

  it('running average = sum / weekCount', () => {
    const weeks = [
      { weekOf: '2025-01-20', totalSeverity: 10 },
      { weekOf: '2025-01-27', totalSeverity: 25 },
      { weekOf: '2025-02-03', totalSeverity: 15 },
      { weekOf: '2025-02-10', totalSeverity: 20 },
    ];

    const result = computeCumulativeFromWeeks('courts', weeks, 8);

    expect(result.runningAverage).toBe(17.5);
  });

  it('high-water mark tracks the highest week', () => {
    const weeks = [
      { weekOf: '2025-01-20', totalSeverity: 10 },
      { weekOf: '2025-01-27', totalSeverity: 25 },
      { weekOf: '2025-02-03', totalSeverity: 15 },
    ];

    const result = computeCumulativeFromWeeks('courts', weeks, 8);

    expect(result.highWaterMark).toBe(25);
    expect(result.highWaterWeek).toBe('2025-01-27');
  });

  it('current week score is the last week', () => {
    const weeks = [
      { weekOf: '2025-01-20', totalSeverity: 10 },
      { weekOf: '2025-02-03', totalSeverity: 20 },
    ];

    const result = computeCumulativeFromWeeks('courts', weeks, 8);

    expect(result.currentWeekScore).toBe(20);
    expect(result.asOf).toBe('2025-02-03');
  });

  it('decay-weighted gives recent weeks more weight (less than running sum)', () => {
    const weeks = [
      { weekOf: '2025-01-20', totalSeverity: 10 },
      { weekOf: '2025-01-27', totalSeverity: 25 },
      { weekOf: '2025-02-03', totalSeverity: 15 },
      { weekOf: '2025-02-10', totalSeverity: 20 },
    ];

    const result = computeCumulativeFromWeeks('courts', weeks, 8);

    expect(result.decayWeightedScore).toBeLessThan(result.runningSum);
    expect(result.decayWeightedScore).toBeGreaterThan(0);
  });

  it('shorter half-life reduces older weeks more aggressively', () => {
    const weeks = [
      { weekOf: '2025-01-20', totalSeverity: 10 },
      { weekOf: '2025-01-27', totalSeverity: 25 },
      { weekOf: '2025-02-03', totalSeverity: 15 },
      { weekOf: '2025-02-10', totalSeverity: 20 },
    ];

    const longHalfLife = computeCumulativeFromWeeks('courts', weeks, 16);
    const shortHalfLife = computeCumulativeFromWeeks('courts', weeks, 2);

    expect(shortHalfLife.decayWeightedScore).toBeLessThan(longHalfLife.decayWeightedScore);
  });

  it('single week: decay-weighted equals the score itself', () => {
    const weeks = [{ weekOf: '2025-01-20', totalSeverity: 10 }];

    const result = computeCumulativeFromWeeks('courts', weeks, 8);

    expect(result.decayWeightedScore).toBe(10);
    expect(result.runningSum).toBe(10);
    expect(result.runningAverage).toBe(10);
    expect(result.highWaterMark).toBe(10);
  });

  it('decay-weighted score matches hand-computed value', () => {
    // 2 weeks, halfLife=1: oldest gets 0.5^(1/1)=0.5, newest gets 0.5^0=1
    const weeks = [
      { weekOf: '2025-01-20', totalSeverity: 10 },
      { weekOf: '2025-01-27', totalSeverity: 20 },
    ];

    const result = computeCumulativeFromWeeks('courts', weeks, 1);

    // 10 * 0.5 + 20 * 1.0 = 25
    expect(result.decayWeightedScore).toBe(25);
  });

  it('high-water mark uses first occurrence when tied', () => {
    const weeks = [
      { weekOf: '2025-01-20', totalSeverity: 30 },
      { weekOf: '2025-01-27', totalSeverity: 10 },
      { weekOf: '2025-02-03', totalSeverity: 30 },
    ];

    const result = computeCumulativeFromWeeks('courts', weeks, 8);

    expect(result.highWaterMark).toBe(30);
    expect(result.highWaterWeek).toBe('2025-01-20');
  });
});

describe('computeCumulativeScores (DB integration)', () => {
  it('returns zeroes when DB is unavailable', async () => {
    mockIsDbAvailable.mockReturnValue(false);

    const result = await computeCumulativeScores('courts');

    expect(result.runningSum).toBe(0);
    expect(result.weekCount).toBe(0);
    expect(result.decayHalfLifeWeeks).toBe(8);
  });

  it('uses custom half-life parameter', async () => {
    mockIsDbAvailable.mockReturnValue(false);

    const result = await computeCumulativeScores('courts', { halfLifeWeeks: 4 });
    expect(result.decayHalfLifeWeeks).toBe(4);
  });
});

describe('computeAllCumulativeScores', () => {
  it('returns empty object when DB is unavailable', async () => {
    mockIsDbAvailable.mockReturnValue(false);
    const result = await computeAllCumulativeScores();
    expect(result).toEqual({});
  });

  it('groups by category and computes per-group', async () => {
    mockIsDbAvailable.mockReturnValue(true);
    mockGetDb.mockReturnValue({
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          orderBy: vi.fn().mockResolvedValue([
            { category: 'courts', weekOf: '2025-01-20', totalSeverity: 10 },
            { category: 'courts', weekOf: '2025-01-27', totalSeverity: 20 },
            { category: 'agencies', weekOf: '2025-01-20', totalSeverity: 5 },
          ]),
        }),
      }),
    } as never);

    const result = await computeAllCumulativeScores();

    expect(Object.keys(result)).toContain('courts');
    expect(Object.keys(result)).toContain('agencies');
    expect(result['courts'].runningSum).toBe(30);
    expect(result['courts'].weekCount).toBe(2);
    expect(result['agencies'].runningSum).toBe(5);
    expect(result['agencies'].weekCount).toBe(1);
  });
});
