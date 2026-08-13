import { describe, expect, it } from 'vitest';
import {
  extractQuotedClaims,
  normalizeForMatch,
  quoteAppearsIn,
} from '@/lib/services/quote-verification';

describe('extractQuotedClaims', () => {
  it('pairs quotes with same-sentence citations', () => {
    const answer =
      'The order called for "greater efficiency and reduced costs to agencies" [Doc 2]. ' +
      'Unrelated sentence follows here with more words.';
    const claims = extractQuotedClaims(answer);
    expect(claims).toHaveLength(1);
    expect(claims[0].quote).toBe('greater efficiency and reduced costs to agencies');
    expect(claims[0].citations).toEqual([2]);
  });

  it('handles curly quotes and multiple citations', () => {
    const answer =
      'Senators warned of a “scorched-earth campaign against the rule of law” [Doc 5] [Doc 7].';
    const claims = extractQuotedClaims(answer);
    expect(claims).toHaveLength(1);
    expect(claims[0].citations).toEqual([5, 7]);
  });

  it('ignores quotes shorter than the floor and returns [] when none', () => {
    expect(extractQuotedClaims('A "short" quote and no long ones here.')).toHaveLength(0);
  });

  it('extraction keeps uncited quotes (the verifier filters them)', () => {
    const claims = extractQuotedClaims(
      'Researchers should try "state and local law enforcement immigration" as a search term.',
    );
    expect(claims).toHaveLength(1);
    expect(claims[0].citations).toEqual([]);
  });
});

describe('quoteAppearsIn', () => {
  const source = normalizeForMatch(
    'ICE allowed my staff 2 hours—just 2 hours—for the entire visit and notified them en route. ' +
      'The court will grant Ms. Slaughter’s motion for summary judgment.',
  );

  it('matches verbatim after normalization (curly quotes, dashes, case)', () => {
    expect(quoteAppearsIn('The court will grant Ms. Slaughter’s motion', source)).toBe(true);
  });

  it('tolerates ellipses as ordered fragments', () => {
    expect(quoteAppearsIn('ICE allowed my staff … for the entire visit', source)).toBe(true);
    expect(quoteAppearsIn('for the entire visit … ICE allowed my staff', source)).toBe(false);
  });

  it('rejects fabricated wording', () => {
    expect(quoteAppearsIn('legally inadequate findings', source)).toBe(false);
  });
});

describe('hyphenation-artifact tolerance (#712 v1.9.15)', () => {
  it('matches a quote against source text with a line-break hyphenation gap', () => {
    const source = normalizeForMatch(
      'positions of a confidential, policy- determining, policy-making, or policy-advocating character',
    );
    expect(quoteAppearsIn('policy-determining, policy-making, or policy-advocating', source)).toBe(
      true,
    );
  });

  it('treats spaced and joined em-dashes identically', () => {
    const source = normalizeForMatch('the rule — adopted in 2020 — remains in force');
    expect(quoteAppearsIn('the rule—adopted in 2020—remains in force', source)).toBe(true);
  });
});

describe('citation-spelling tolerance (#716 v1.9.23)', () => {
  it('matches quotes across 287(g)/287g spellings', () => {
    const source = normalizeForMatch(
      'ending their engagement in 287(g) agreements with the agency',
    );
    expect(quoteAppearsIn('engagement in 287G agreements', source)).toBe(true);
  });
});
