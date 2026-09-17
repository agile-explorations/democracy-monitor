import { afterEach, describe, expect, it } from 'vitest';
import {
  blindChannelGateEnabled,
  rosterTighteningEnabled,
  salienceRulesStamp,
} from '@/lib/services/salience-knobs';

const KNOBS = ['SALIENCE_BLIND_GATE', 'SALIENCE_ROSTER_TIGHTEN'] as const;

describe('salience knobs (#911–#913)', () => {
  const prev = Object.fromEntries(KNOBS.map((k) => [k, process.env[k]]));
  afterEach(() => {
    for (const k of KNOBS) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });

  it('gate and tightening are on by default and only "off" disables them', () => {
    for (const k of KNOBS) delete process.env[k];
    expect(blindChannelGateEnabled()).toBe(true);
    expect(rosterTighteningEnabled()).toBe(true);
    process.env.SALIENCE_BLIND_GATE = 'off';
    process.env.SALIENCE_ROSTER_TIGHTEN = 'off';
    expect(blindChannelGateEnabled()).toBe(false);
    expect(rosterTighteningEnabled()).toBe(false);
    process.env.SALIENCE_BLIND_GATE = 'on';
    expect(blindChannelGateEnabled()).toBe(true);
  });

  it('the rules stamp names every knob and moves when one flips', () => {
    for (const k of KNOBS) delete process.env[k];
    const on = salienceRulesStamp();
    expect(on).toMatch(/^gate=1,cap=\d+,tighten=1,picks=\d+$/);
    process.env.SALIENCE_BLIND_GATE = 'off';
    expect(salienceRulesStamp()).not.toBe(on);
    expect(salienceRulesStamp()).toMatch(/^gate=0,/);
  });
});
