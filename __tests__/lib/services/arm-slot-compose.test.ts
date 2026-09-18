import { afterEach, describe, expect, it } from 'vitest';
import type { SlotArm } from '@/lib/services/arm-slot-compose';
import {
  applyRosterTightening,
  composeArmSlotPool,
  PER_ARM_CAP,
  rosterTighteningEnabled,
  UNCORROBORATED_ARM_CAP,
} from '@/lib/services/arm-slot-compose';

const arm = (phrase: string, matches: number, ids: number[], perArmCap?: number): SlotArm => ({
  phrase,
  matches,
  items: ids.map((id) => ({ id, sourceType: 'fr', matchedAlias: phrase })),
  ...(perArmCap !== undefined ? { perArmCap } : {}),
});

describe('composeArmSlotPool per-arm cap override (#913)', () => {
  it('lets a capped arm place fewer docs than the pool-wide cap', () => {
    const picked = composeArmSlotPool(
      [
        arm('Specific Global', 10, [1, 2, 3], UNCORROBORATED_ARM_CAP),
        arm('Pool Pick', 20, [4, 5, 6]),
      ],
      new Set(),
      PER_ARM_CAP,
      10,
    );
    const byArm = (phrase: string) => picked.filter((h) => h.matchedAlias === phrase).length;
    expect(byArm('Specific Global')).toBe(1);
    expect(byArm('Pool Pick')).toBe(PER_ARM_CAP);
  });
});

describe('applyRosterTightening (#913)', () => {
  const selection = {
    judgedPhrases: ['Newsom v. Trump', 'Specific Global'],
    uncorroboratedPhrases: ['Specific Global'],
  };

  it('removes uncorroborated picks from the priority seats and marks them low-cap', () => {
    const out = applyRosterTightening(selection, true);
    expect(out.priorityPhrases).toEqual(['Newsom v. Trump']);
    expect(out.lowCapPhrases).toEqual(new Set(['specific global']));
  });

  it('is a no-op when the knob is off', () => {
    const out = applyRosterTightening(selection, false);
    expect(out.priorityPhrases).toEqual(selection.judgedPhrases);
    expect(out.lowCapPhrases.size).toBe(0);
  });
});

describe('SALIENCE_ROSTER_TIGHTEN knob', () => {
  const prev = process.env.SALIENCE_ROSTER_TIGHTEN;
  afterEach(() => {
    if (prev === undefined) delete process.env.SALIENCE_ROSTER_TIGHTEN;
    else process.env.SALIENCE_ROSTER_TIGHTEN = prev;
  });
  it('is on by default and only "off" disables it', () => {
    delete process.env.SALIENCE_ROSTER_TIGHTEN;
    expect(rosterTighteningEnabled()).toBe(true);
    process.env.SALIENCE_ROSTER_TIGHTEN = 'off';
    expect(rosterTighteningEnabled()).toBe(false);
  });
});
