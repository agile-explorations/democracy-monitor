import { describe, it, expect } from 'vitest';
import {
  l1Fired,
  l2Fired,
  l3Fired,
  computeMissReason,
  evaluateNc1BidenP1FlagRate,
  evaluateNc2BidenP2ConfirmRate,
  evaluateNc3BidenElevatedWeeks,
  evaluateNc4TransitionComparison,
  evaluateNc5BaselineConcerningRate,
  evaluateNc6T2RoutineRate,
  evaluateEventDetection,
} from '@/lib/services/event-validation-checks';
import type { KnownEvent } from '@/lib/validation/known-events';

// --- Layer firing ---

describe('layer firing thresholds', () => {
  describe('l1Fired', () => {
    it('returns true when structural score exceeds threshold (2.5)', () => {
      expect(l1Fired(3.0)).toBe(true);
    });

    it('returns false at threshold', () => {
      expect(l1Fired(2.5)).toBe(false);
    });

    it('returns false below threshold', () => {
      expect(l1Fired(1.0)).toBe(false);
    });

    it('returns false for null', () => {
      expect(l1Fired(null)).toBe(false);
    });
  });

  describe('l2Fired', () => {
    it('returns true when AI score exceeds threshold (1.5)', () => {
      expect(l2Fired(2.0)).toBe(true);
    });

    it('returns false at threshold', () => {
      expect(l2Fired(1.5)).toBe(false);
    });

    it('returns false for null', () => {
      expect(l2Fired(null)).toBe(false);
    });
  });

  describe('l3Fired', () => {
    it('returns true when absolute thematic score exceeds threshold (3.5)', () => {
      expect(l3Fired(4.0)).toBe(true);
    });

    it('returns true for negative scores exceeding threshold', () => {
      expect(l3Fired(-4.0)).toBe(true);
    });

    it('returns false at threshold', () => {
      expect(l3Fired(3.5)).toBe(false);
    });

    it('returns false for null', () => {
      expect(l3Fired(null)).toBe(false);
    });
  });
});

// --- Negative controls ---

describe('negative control evaluations', () => {
  describe('NC-1: Biden 2022 P1 flag rate', () => {
    it('passes when all categories are within bounds', () => {
      const rates = [
        { category: 'civilService', flagRate: 0.05 },
        { category: 'fiscal', flagRate: 0.12 },
      ];
      const result = evaluateNc1BidenP1FlagRate(rates);
      expect(result.pass).toBe(true);
      expect(result.id).toBe('NC-1');
    });

    it('fails when any category exceeds 20%', () => {
      const rates = [
        { category: 'civilService', flagRate: 0.05 },
        { category: 'fiscal', flagRate: 0.25 },
      ];
      const result = evaluateNc1BidenP1FlagRate(rates);
      expect(result.pass).toBe(false);
      expect(result.details?.find((d) => d.category === 'fiscal')?.pass).toBe(false);
    });

    it('passes at 20% boundary', () => {
      const rates = [{ category: 'civilService', flagRate: 0.2 }];
      const result = evaluateNc1BidenP1FlagRate(rates);
      expect(result.pass).toBe(true);
    });
  });

  describe('NC-2: Biden 2022 P2 confirmation rate', () => {
    it('passes within 8–70% range', () => {
      expect(evaluateNc2BidenP2ConfirmRate(0.35).pass).toBe(true);
    });

    it('fails below 8%', () => {
      expect(evaluateNc2BidenP2ConfirmRate(0.05).pass).toBe(false);
    });

    it('fails above 70%', () => {
      expect(evaluateNc2BidenP2ConfirmRate(0.8).pass).toBe(false);
    });

    it('passes at boundaries', () => {
      expect(evaluateNc2BidenP2ConfirmRate(0.08).pass).toBe(true);
      expect(evaluateNc2BidenP2ConfirmRate(0.7).pass).toBe(true);
    });
  });

  describe('NC-3: Biden 2022 elevated weeks (tiered thresholds)', () => {
    it('passes at ≤5% for categories with ≥20 avg docs/week', () => {
      const data = [
        { category: 'civilService', elevatedCount: 2, totalWeeks: 52, avgDocsPerWeek: 30 },
      ];
      expect(evaluateNc3BidenElevatedWeeks(data).pass).toBe(true);
    });

    it('fails at >5% for categories with ≥20 avg docs/week', () => {
      const data = [
        { category: 'civilService', elevatedCount: 5, totalWeeks: 52, avgDocsPerWeek: 30 },
      ];
      expect(evaluateNc3BidenElevatedWeeks(data).pass).toBe(false);
    });

    it('passes at ≤10% for thin categories (<20 avg docs/week)', () => {
      const data = [{ category: 'elections', elevatedCount: 5, totalWeeks: 52, avgDocsPerWeek: 6 }];
      expect(evaluateNc3BidenElevatedWeeks(data).pass).toBe(true);
    });

    it('fails at >10% for thin categories', () => {
      const data = [{ category: 'elections', elevatedCount: 6, totalWeeks: 52, avgDocsPerWeek: 6 }];
      expect(evaluateNc3BidenElevatedWeeks(data).pass).toBe(false);
    });

    it('fails when any single category exceeds its threshold', () => {
      const data = [
        { category: 'civilService', elevatedCount: 0, totalWeeks: 52, avgDocsPerWeek: 30 },
        { category: 'fiscal', elevatedCount: 10, totalWeeks: 52, avgDocsPerWeek: 100 },
      ];
      expect(evaluateNc3BidenElevatedWeeks(data).pass).toBe(false);
    });
  });

  describe('NC-4: transition comparison', () => {
    it('passes when Biden T1 rate < Trump T2 rate', () => {
      expect(evaluateNc4TransitionComparison(0.1, 0.3).pass).toBe(true);
    });

    it('fails when Biden T1 rate >= Trump T2 rate', () => {
      expect(evaluateNc4TransitionComparison(0.3, 0.3).pass).toBe(false);
      expect(evaluateNc4TransitionComparison(0.4, 0.3).pass).toBe(false);
    });
  });

  describe('NC-5: baseline concerning rate', () => {
    it('passes when ≤5%', () => {
      expect(evaluateNc5BaselineConcerningRate(0.03).pass).toBe(true);
    });

    it('fails when >5%', () => {
      expect(evaluateNc5BaselineConcerningRate(0.08).pass).toBe(false);
    });
  });

  describe('NC-6: T2 routine rate', () => {
    it('passes when ≥50%', () => {
      expect(evaluateNc6T2RoutineRate(0.65).pass).toBe(true);
    });

    it('fails when <50%', () => {
      expect(evaluateNc6T2RoutineRate(0.4).pass).toBe(false);
    });
  });
});

// --- Event detection ---

describe('evaluateEventDetection', () => {
  const baseEvent: KnownEvent = {
    id: 'T2-1',
    date: '2025-01-20',
    category: 'executiveActions',
    description: 'Day One EO blitz',
    period: 'trump_t2',
    expectedMinStatus: 'Elevated',
    signalDensity: 'strong',
  };

  it('detects event when status meets expectedMinStatus', () => {
    const result = evaluateEventDetection(baseEvent, {
      status: 'Elevated',
      structuralScore: 3.0,
      aiScore: 2.0,
      thematicScore: 4.0,
    });
    expect(result.detected).toBe(true);
    expect(result.convergenceStatus).toBe('Elevated');
    expect(result.missReason).toBeNull();
  });

  it('detects event when status exceeds expectedMinStatus', () => {
    const result = evaluateEventDetection(baseEvent, {
      status: 'Divergent',
      structuralScore: 4.0,
      aiScore: 3.0,
      thematicScore: 5.0,
    });
    expect(result.detected).toBe(true);
    expect(result.missReason).toBeNull();
  });

  it('does not detect when status is below expectedMinStatus', () => {
    const result = evaluateEventDetection(baseEvent, {
      status: 'Stable',
      structuralScore: 1.0,
      aiScore: 0.5,
      thematicScore: 1.0,
    });
    expect(result.detected).toBe(false);
    expect(result.missReason).toBe('scoring_miss');
  });

  it('does not detect when no data exists', () => {
    const result = evaluateEventDetection(baseEvent, null);
    expect(result.detected).toBe(false);
    expect(result.convergenceStatus).toBeNull();
    expect(result.missReason).toBe('data_absent');
  });

  it('correctly identifies layer firing', () => {
    const result = evaluateEventDetection(baseEvent, {
      status: 'Elevated',
      structuralScore: 3.0,
      aiScore: 0.5,
      thematicScore: null,
    });
    expect(result.l1Fired).toBe(true);
    expect(result.l2Fired).toBe(false);
    expect(result.l3Fired).toBe(false);
  });

  it('distinguishes l2Fired (raw) from l2Converged', () => {
    const result = evaluateEventDetection(baseEvent, {
      status: 'Elevated',
      structuralScore: 3.0,
      aiScore: 2.0,
      thematicScore: null,
      convergenceAiElevated: false,
    });
    expect(result.l2Fired).toBe(true);
    expect(result.l2Converged).toBe(false);
  });

  it('l2Converged reflects convergenceAiElevated from weekly_aggregates', () => {
    const result = evaluateEventDetection(baseEvent, {
      status: 'Elevated',
      structuralScore: 3.0,
      aiScore: 2.0,
      thematicScore: null,
      convergenceAiElevated: true,
    });
    expect(result.l2Fired).toBe(true);
    expect(result.l2Converged).toBe(true);
  });

  it('l2Converged defaults to false when convergenceAiElevated is null', () => {
    const result = evaluateEventDetection(baseEvent, {
      status: 'Elevated',
      structuralScore: 3.0,
      aiScore: 2.0,
      thematicScore: null,
    });
    expect(result.l2Converged).toBe(false);
  });

  it('preserves event metadata', () => {
    const eventWithNotes: KnownEvent = {
      ...baseEvent,
      notes: 'Expected miss',
      signalDensity: 'thin',
    };
    const result = evaluateEventDetection(eventWithNotes, null);
    expect(result.notes).toBe('Expected miss');
    expect(result.signalDensity).toBe('thin');
    expect(result.expectedMinStatus).toBe('Elevated');
  });

  it('computes correct weekOf from event date', () => {
    // Jan 20, 2025 is a Monday
    const result = evaluateEventDetection(baseEvent, null);
    expect(result.weekOf).toBe('2025-01-20');

    // Jan 24, 2025 is a Friday — should map to Monday Jan 20
    const fridayEvent: KnownEvent = { ...baseEvent, date: '2025-01-24' };
    const fridayResult = evaluateEventDetection(fridayEvent, null);
    expect(fridayResult.weekOf).toBe('2025-01-20');
  });
});

// --- Miss reason classification ---

describe('computeMissReason', () => {
  const event: KnownEvent = {
    id: 'T2-1',
    date: '2025-01-20',
    category: 'executiveActions',
    description: 'Day One EO blitz',
    period: 'trump_t2',
    expectedMinStatus: 'Elevated',
    signalDensity: 'strong',
  };

  it('returns null for detected events', () => {
    expect(computeMissReason(event, { status: 'Elevated', aiScore: 2.0 }, true)).toBeNull();
  });

  it('returns data_absent when no week data exists', () => {
    expect(computeMissReason(event, null, false)).toBe('data_absent');
  });

  it('returns data_absent when status is null', () => {
    expect(computeMissReason(event, { status: null, aiScore: null }, false)).toBe('data_absent');
  });

  it('returns pending_backfill for T1 events expecting L2 with no L2 data', () => {
    const t1Event: KnownEvent = {
      ...event,
      period: 'trump_t1',
      expectedLayers: { l2: true },
    };
    expect(computeMissReason(t1Event, { status: 'Stable', aiScore: null }, false)).toBe(
      'pending_backfill',
    );
  });

  it('returns scoring_miss for T1 events expecting L2 when L2 data exists', () => {
    const t1Event: KnownEvent = {
      ...event,
      period: 'trump_t1',
      expectedLayers: { l2: true },
    };
    expect(computeMissReason(t1Event, { status: 'Stable', aiScore: 0.5 }, false)).toBe(
      'scoring_miss',
    );
  });

  it('returns source_gap for events with "Expected miss" notes', () => {
    const gapEvent: KnownEvent = {
      ...event,
      notes: 'Expected miss — signal in media/rhetoric',
    };
    expect(computeMissReason(gapEvent, { status: 'Stable', aiScore: 0.5 }, false)).toBe(
      'source_gap',
    );
  });

  it('returns thin_category for thin signal density events', () => {
    const thinEvent: KnownEvent = {
      ...event,
      signalDensity: 'thin',
    };
    expect(computeMissReason(thinEvent, { status: 'Stable', aiScore: 0.5 }, false)).toBe(
      'thin_category',
    );
  });

  it('returns scoring_miss for generic misses', () => {
    expect(computeMissReason(event, { status: 'Stable', aiScore: 0.5 }, false)).toBe(
      'scoring_miss',
    );
  });

  it('does not return pending_backfill for T2 events', () => {
    const t2Event: KnownEvent = {
      ...event,
      period: 'trump_t2',
      expectedLayers: { l2: true },
    };
    expect(computeMissReason(t2Event, { status: 'Stable', aiScore: null }, false)).not.toBe(
      'pending_backfill',
    );
  });
});
