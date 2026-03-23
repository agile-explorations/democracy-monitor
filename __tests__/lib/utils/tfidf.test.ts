import { describe, it, expect } from 'vitest';
import { tokenize, stripMarkup, computeShiftTerms } from '@/lib/utils/tfidf';

describe('stripMarkup', () => {
  it('removes CSS blocks', () => {
    const input =
      'DCPD202500636 * {margin:0; padding:0;} .s1 { color: black; font-size: 12pt; } Hello world';
    const result = stripMarkup(input);
    expect(result).not.toContain('margin');
    expect(result).not.toContain('padding');
    expect(result).not.toContain('color');
    expect(result).toContain('Hello world');
  });

  it('removes HTML tags', () => {
    expect(stripMarkup('<p>Budget <strong>allocation</strong> report</p>')).toBe(
      'Budget allocation report',
    );
  });

  it('removes document ID prefixes', () => {
    const result = stripMarkup('DCPD202500636 Executive Order on Immigration');
    expect(result).not.toContain('DCPD202500636');
    expect(result).toContain('Executive Order on Immigration');
  });

  it('removes HTML entities', () => {
    expect(stripMarkup('fish &amp; wildlife')).toBe('fish wildlife');
  });

  it('collapses whitespace', () => {
    expect(stripMarkup('  too   many   spaces  ')).toBe('too many spaces');
  });
});

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric', () => {
    const tokens = tokenize('Immigration Enforcement Policy');
    expect(tokens).toContain('immigration');
    expect(tokens).toContain('enforcement');
    expect(tokens).toContain('policy');
  });

  it('filters tokens shorter than 3 characters', () => {
    const tokens = tokenize('A new OPM budget is set');
    expect(tokens).not.toContain('is');
    expect(tokens).toContain('opm');
    expect(tokens).toContain('budget');
    expect(tokens).toContain('set');
  });

  it('filters general stopwords', () => {
    const tokens = tokenize('the government of the people');
    expect(tokens).not.toContain('the');
    expect(tokens).not.toContain('of');
  });

  it('filters domain-specific stopwords', () => {
    const tokens = tokenize('federal register document notice section amendment');
    expect(tokens).toHaveLength(0);
  });

  it('filters pure numbers', () => {
    const tokens = tokenize('2025 budget 123 allocation');
    expect(tokens).not.toContain('2025');
    expect(tokens).not.toContain('123');
    expect(tokens).toContain('budget');
    expect(tokens).toContain('allocation');
  });

  it('handles empty string', () => {
    expect(tokenize('')).toEqual([]);
  });

  it('strips CSS/HTML boilerplate before tokenizing', () => {
    const cssHeavy =
      'DCPD202500636 * {margin:0; padding:0;} .s1 { color: black; font-family:"Times New Roman"; font-size: 12pt; } Immigration enforcement policy';
    const tokens = tokenize(cssHeavy);
    expect(tokens).not.toContain('font');
    expect(tokens).not.toContain('margin');
    expect(tokens).not.toContain('color');
    expect(tokens).not.toContain('size');
    expect(tokens).toContain('immigration');
    expect(tokens).toContain('enforcement');
    expect(tokens).toContain('policy');
  });

  it('splits on hyphens and special chars', () => {
    const tokens = tokenize('cross-border tariff (metric)');
    expect(tokens).toContain('cross');
    expect(tokens).toContain('border');
    expect(tokens).toContain('tariff');
    expect(tokens).toContain('metric');
  });
});

describe('computeShiftTerms', () => {
  it('returns empty when both inputs are empty', () => {
    const result = computeShiftTerms([], []);
    expect(result).toEqual({ fromTerms: [], toTerms: [] });
  });

  it('identifies distinctive drift terms', () => {
    const typical = [
      'routine personnel management guidelines for hiring',
      'standard hiring procedures manual for employees',
      'employee benefits allocation update quarterly',
    ];
    const drift = [
      'emergency restructuring of workforce reorganization',
      'unprecedented reorganization mandate for termination',
      'mass termination workforce expansion directive',
    ];
    const result = computeShiftTerms(typical, drift);
    expect(result.toTerms.length).toBeGreaterThan(0);
    expect(result.fromTerms.length).toBeGreaterThan(0);
    // Drift terms should relate to drift corpus (restructuring, termination, etc.)
    const driftText = drift.join(' ').toLowerCase();
    const typicalText = typical.join(' ').toLowerCase();
    expect(result.toTerms.some((t) => driftText.includes(t))).toBe(true);
    expect(result.fromTerms.some((t) => typicalText.includes(t))).toBe(true);
  });

  it('limits to topN terms', () => {
    const typical = ['alpha beta gamma delta epsilon zeta eta theta iota kappa lambda'];
    const drift = ['omega psi chi phi upsilon tau sigma rho omicron'];
    const result = computeShiftTerms(typical, drift, 3);
    expect(result.toTerms.length).toBeLessThanOrEqual(3);
    expect(result.fromTerms.length).toBeLessThanOrEqual(3);
  });

  it('handles single-document corpora', () => {
    const result = computeShiftTerms(
      ['quarterly budget allocation'],
      ['tariff enforcement waiver'],
    );
    expect(result.toTerms.length).toBeGreaterThan(0);
  });

  it('produces bigrams when adjacent tokens are meaningful', () => {
    const typical = [
      'civil rights enforcement cases filed quarterly',
      'civil rights protection oversight committee',
    ];
    const drift = [
      'military deployment overseas combat operations',
      'military operations strategic planning defense',
    ];
    const result = computeShiftTerms(typical, drift, 5);
    const allTerms = [...result.fromTerms, ...result.toTerms];
    const hasBigram = allTerms.some((t) => t.includes(' '));
    expect(hasBigram).toBe(true);
  });

  it('deduplicates unigrams subsumed by bigrams', () => {
    const typical = ['wildlife habitat conservation wilderness areas'];
    const drift = ['drilling permits fossil fuel extraction pipeline'];
    const result = computeShiftTerms(typical, drift, 5);
    // If "fossil fuel" is selected, "fossil" alone should not appear
    for (const bigram of result.toTerms.filter((t) => t.includes(' '))) {
      const parts = bigram.split(' ');
      for (const part of parts) {
        expect(result.toTerms.filter((t) => t === part)).toHaveLength(0);
      }
    }
  });
});
