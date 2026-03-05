import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '@/lib/data/categories';
import { ALL_KNOWN_EVENTS, TRUMP_T1_EVENTS, TRUMP_T2_EVENTS } from '@/lib/validation/known-events';
import type { KnownEvent } from '@/lib/validation/known-events';

const VALID_CATEGORY_KEYS = new Set(CATEGORIES.map((c) => c.key));
const VALID_PERIODS: KnownEvent['period'][] = ['trump_t1', 'biden_2021', 'biden_2022', 'trump_t2'];

describe('known-events data consistency', () => {
  it('ALL_KNOWN_EVENTS combines T1 and T2 arrays', () => {
    expect(ALL_KNOWN_EVENTS.length).toBe(TRUMP_T1_EVENTS.length + TRUMP_T2_EVENTS.length);
  });

  it('all category keys exist in CATEGORIES', () => {
    const invalid = ALL_KNOWN_EVENTS.filter((e) => !VALID_CATEGORY_KEYS.has(e.category));
    expect(invalid).toEqual([]);
  });

  it('all dates parse to valid Date objects', () => {
    for (const event of ALL_KNOWN_EVENTS) {
      const d = new Date(event.date);
      expect(d.toString()).not.toBe('Invalid Date');
    }
  });

  it('all dates are in YYYY-MM-DD format', () => {
    for (const event of ALL_KNOWN_EVENTS) {
      expect(event.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('all periods are valid', () => {
    for (const event of ALL_KNOWN_EVENTS) {
      expect(VALID_PERIODS).toContain(event.period);
    }
  });

  it('no duplicate (id, category, date) tuples', () => {
    const seen = new Set<string>();
    const dupes: string[] = [];
    for (const event of ALL_KNOWN_EVENTS) {
      const key = `${event.id}:${event.category}:${event.date}`;
      if (seen.has(key)) dupes.push(key);
      seen.add(key);
    }
    expect(dupes).toEqual([]);
  });

  it('all IDs follow T<period>-<number> format', () => {
    for (const event of ALL_KNOWN_EVENTS) {
      expect(event.id).toMatch(/^T\d+-\d+$/);
    }
  });

  it('T1 events have trump_t1 period', () => {
    for (const event of TRUMP_T1_EVENTS) {
      expect(event.period).toBe('trump_t1');
    }
  });

  it('T2 events have trump_t2 period', () => {
    for (const event of TRUMP_T2_EVENTS) {
      expect(event.period).toBe('trump_t2');
    }
  });

  it('all expectedMinStatus values are valid convergence statuses', () => {
    const validStatuses = ['Stable', 'Elevated', 'Divergent', 'ConfirmedConcern'];
    for (const event of ALL_KNOWN_EVENTS) {
      expect(validStatuses).toContain(event.expectedMinStatus);
    }
  });

  it('events marked as expected misses have Stable expectedMinStatus', () => {
    const expectedMisses = ALL_KNOWN_EVENTS.filter(
      (e) => e.notes && e.notes.includes('Expected miss'),
    );
    for (const event of expectedMisses) {
      expect(event.expectedMinStatus).toBe('Stable');
    }
  });
});
