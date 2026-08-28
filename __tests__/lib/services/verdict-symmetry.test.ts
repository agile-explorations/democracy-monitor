import { describe, expect, it } from 'vitest';
import {
  hasSwappableToken,
  summarizeSymmetry,
  swapAdministrationTokens,
  wilson95,
} from '@/lib/services/verdict-symmetry';
import type { SymmetryRecord } from '@/lib/services/verdict-symmetry';

describe('swapAdministrationTokens (#772)', () => {
  it('exchanges presidents both ways without swapping back', () => {
    expect(swapAdministrationTokens('President Trump reversed President Biden.')).toBe(
      'President Biden reversed President Trump.',
    );
    expect(swapAdministrationTokens('Donald J. Trump signed; Joseph R. Biden, Jr. had not.')).toBe(
      'Joseph R. Biden, Jr. signed; Donald J. Trump had not.',
    );
  });

  it('swaps administrations, vice presidents by title and party names', () => {
    expect(
      swapAdministrationTokens(
        'The Trump administration, Vice President Vance and the Republican Party.',
      ),
    ).toBe('The Biden administration, Vice President Harris and the Democratic Party.');
  });

  it('leaves order numbers, dates, agency heads and lowercase "democratic" alone', () => {
    const text =
      'Executive Order 14029 of May 14, 2021 amended Civil Service Rule VI; democratic institutions; Attorney General Bondi.';
    expect(swapAdministrationTokens(text)).toBe(text);
    expect(hasSwappableToken(text)).toBe(false);
  });

  it('respects word boundaries', () => {
    expect(swapAdministrationTokens('Trumpet players and Bidenomics')).toBe(
      'Trumpet players and Bidenomics',
    );
  });

  it('round-trips', () => {
    const text = 'President Trump and the Biden administration; Vice President Harris.';
    expect(swapAdministrationTokens(swapAdministrationTokens(text))).toBe(text);
  });
});

describe('summarizeSymmetry', () => {
  const rec = (
    rowId: number,
    original: SymmetryRecord['original'],
    control: SymmetryRecord['control'],
    swapped: SymmetryRecord['swapped'],
    category = 'civilService',
  ): SymmetryRecord => ({ rowId, category, original, control, swapped });

  it('separates model noise from swap-induced flips and reports direction', () => {
    const s = summarizeSymmetry([
      rec(1, 'clearly_concerning', 'clearly_concerning', 'routine'), // swap flipped (less)
      rec(2, 'routine', 'routine', 'clearly_concerning'), // swap flipped (more)
      rec(3, 'routine', 'potentially_concerning', 'potentially_concerning'), // control noise only
      rec(4, 'routine', 'routine', 'novel_not_concerning'), // label flip, same side of the line
      rec(5, 'routine', null, 'routine'), // unpaired
    ]);
    expect(s).toMatchObject({
      docs: 5,
      paired: 4,
      controlConcernDisagreement: 1,
      swapConcernFlips: 2,
      swapLabelFlips: 3,
      towardMoreConcerning: 1,
      towardLessConcerning: 1,
    });
    expect(s.swapConcernFlipRate).toBeCloseTo(0.5);
    expect(s.controlConcernRate).toBeCloseTo(0.25);
    expect(s.netConcernFlipRate).toBeCloseTo(0.25);
    expect(s.byCategory.civilService).toEqual({ paired: 4, swapConcernFlips: 2 });
  });

  it('wilson95 brackets the observed rate and stays inside [0, 1]', () => {
    const [lo, hi] = wilson95(10, 200);
    expect(lo).toBeGreaterThan(0.02);
    expect(lo).toBeLessThan(0.05);
    expect(hi).toBeGreaterThan(0.05);
    expect(hi).toBeLessThan(0.1);
    expect(wilson95(0, 0)).toEqual([0, 0]);
    expect(wilson95(200, 200)[1]).toBe(1);
  });
});

describe('eraLabel', () => {
  it('names the current term and baseline ids', async () => {
    const { eraLabel } = await import('@/lib/services/verdict-rates');
    expect(eraLabel('trump_t2')).toContain('current term');
    expect(eraLabel('biden_2022')).toBe('Biden 2022–23');
    expect(eraLabel('unknown_era')).toBe('unknown_era');
  });
});
