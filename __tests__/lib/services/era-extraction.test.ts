import { describe, expect, it } from 'vitest';
import { extractComparisonEras, extractDateFloor } from '@/lib/services/era-extraction';

const keys = (q: string) => extractComparisonEras(q)?.map((e) => e.key) ?? null;

describe('extractComparisonEras (#592)', () => {
  it('extracts the two named Trump terms', () => {
    expect(
      keys(
        'How have congressional responses differed between the first and second Trump administrations?',
      ),
    ).toEqual(['trump_t1', 'trump_t2']);
  });

  it('extracts Biden vs current Trump term', () => {
    expect(
      keys('Compare detention policy under Biden versus the second Trump administration'),
    ).toEqual(['biden', 'trump_t2']);
    expect(keys('How does Biden compare to Trump on enforcement?')).toEqual(['biden', 'trump_t2']);
  });

  it('maps year references to their containing terms', () => {
    expect(
      keys(
        'How did congressional responses to the 2020 Schedule F executive order compare to responses to the 2025 reinstatement?',
      ),
    ).toEqual(['trump_t1', 'trump_t2']);
  });

  it('returns all three for across-administrations phrasing', () => {
    expect(keys('How did detention-related rulemaking compare across administrations?')).toEqual([
      'trump_t1',
      'biden',
      'trump_t2',
    ]);
    expect(
      keys(
        'How did detention rulemaking under the Biden administration compare to both Trump administrations?',
      ),
    ).toEqual(['trump_t1', 'biden', 'trump_t2']);
  });

  it('treats presidential-term synonyms as across-administrations (#729 follow-up)', () => {
    const allThree = ['trump_t1', 'biden', 'trump_t2'];
    expect(
      keys('Give me an overview of the approach to law enforcement across presidential terms.'),
    ).toEqual(allThree);
    expect(keys('How has rulemaking differed between presidencies?')).toEqual(allThree);
    expect(keys('Compare emergency declarations across presidents.')).toEqual(allThree);
  });

  it('does not stratify non-comparative or single-era questions', () => {
    expect(keys('What OPM actions have been taken since January 2025?')).toBeNull();
    expect(keys('What executive orders were issued in 2020?')).toBeNull();
    expect(keys('Which members of Congress spoke about reclassification?')).toBeNull();
    expect(keys('How has enforcement varied across states?')).toBeNull();
  });
});

describe('extractDateFloor (#594 range phrases)', () => {
  it('maps "since January 2025" to a month floor', () => {
    expect(
      extractDateFloor(
        'What OPM and OMB actions have been taken regarding federal workforce restructuring since January 2025?',
      ),
    ).toBe('2025-01-01');
  });
  it('maps bare "since 2017" to a year floor', () => {
    expect(
      extractDateFloor('What executive orders have modified agency independence since 2017?'),
    ).toBe('2017-01-01');
  });
  it('stays silent without a range phrase', () => {
    expect(extractDateFloor('What court cases have challenged executive authority?')).toBeNull();
  });
});
