import { describe, expect, it } from 'vitest';
import { isProceduralTitle } from '@/lib/data/procedural-titles';

describe('procedural title matcher (#593)', () => {
  it('matches the boilerplate genres observed crowding research results', () => {
    expect(isProceduralTitle('REPORTS OF COMMITTEES ON PUBLIC BILLS AND RESOLUTIONS')).toBe(true);
    expect(isProceduralTitle('EXECUTIVE AND OTHER COMMUNICATIONS')).toBe(true);
    expect(
      isProceduralTitle('PROVIDING FOR CONSIDERATION OF THE BILL (H.R. 1181) TO PROHIBIT...'),
    ).toBe(true);
    expect(isProceduralTitle('Messages from the House')).toBe(true);
  });

  it('never matches substantive titles', () => {
    expect(isProceduralTitle('287(g) Expansion Act')).toBe(false);
    expect(isProceduralTitle('FEDERAL WORKER NDAs')).toBe(false);
    expect(isProceduralTitle('PREVENTING A PATRONAGE SYSTEM ACT OF 2021')).toBe(false);
    expect(isProceduralTitle('STATEMENTS ON INTRODUCED BILLS AND JOINT RESOLUTIONS')).toBe(false);
    expect(
      isProceduralTitle('Executive Order 13957—Creating Schedule F in the Excepted Service'),
    ).toBe(false);
  });
});
