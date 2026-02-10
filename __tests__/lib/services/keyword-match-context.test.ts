import { describe, it, expect } from 'vitest';
import {
  stripAnnotation,
  classifyMatchTier,
  findMatchSource,
  generateKeywordCounterEvidence,
} from '@/lib/services/keyword-match-context';
import type { ContentItem } from '@/lib/types';

describe('stripAnnotation', () => {
  it('strips parenthetical annotation from the end', () => {
    expect(stripAnnotation('defied court order (authoritative source)')).toBe('defied court order');
  });

  it('strips systematic pattern annotation', () => {
    expect(stripAnnotation('mass removal (systematic pattern)')).toBe('mass removal');
  });

  it('returns lowercase trimmed string when no annotation present', () => {
    expect(stripAnnotation('Contempt of Court')).toBe('contempt of court');
  });

  it('handles empty string', () => {
    expect(stripAnnotation('')).toBe('');
  });
});

describe('classifyMatchTier', () => {
  it('classifies a capture-tier keyword for the courts category', () => {
    expect(classifyMatchTier('contempt of court', 'courts')).toBe('capture');
  });

  it('classifies a drift-tier keyword for the courts category', () => {
    expect(classifyMatchTier('delayed compliance', 'courts')).toBe('drift');
  });

  it('classifies a warning-tier keyword for the courts category', () => {
    expect(classifyMatchTier('injunction issued', 'courts')).toBe('warning');
  });

  it('strips annotations before matching', () => {
    expect(classifyMatchTier('contempt of court (authoritative source)', 'courts')).toBe('capture');
  });

  it('falls back to capture for systematic pattern annotation on unknown keyword', () => {
    expect(classifyMatchTier('unknown keyword (systematic pattern)', 'courts')).toBe('capture');
  });

  it('falls back to capture for authoritative source annotation on unknown keyword', () => {
    expect(classifyMatchTier('unknown keyword (authoritative source)', 'courts')).toBe('capture');
  });

  it('returns warning for unknown category', () => {
    expect(classifyMatchTier('something', 'nonexistentCategory')).toBe('warning');
  });

  it('returns warning for unrecognized keyword in a valid category', () => {
    expect(classifyMatchTier('unrecognized gibberish', 'courts')).toBe('warning');
  });
});

describe('findMatchSource', () => {
  const items: ContentItem[] = [
    { title: 'Court defied court order on immigration', summary: 'Details of the case.' },
    { title: 'Budget Update', summary: 'Fiscal overview for Q3.' },
  ];

  it('finds the source item containing the keyword', () => {
    expect(findMatchSource('defied court order', items)).toBe(
      'Court defied court order on immigration',
    );
  });

  it('strips annotations before searching', () => {
    expect(findMatchSource('defied court order (authoritative source)', items)).toBe(
      'Court defied court order on immigration',
    );
  });

  it('returns "(source not identified)" when no item matches', () => {
    expect(findMatchSource('completely unrelated term', items)).toBe('(source not identified)');
  });

  it('returns "(source not identified)" for empty items array', () => {
    expect(findMatchSource('anything', [])).toBe('(source not identified)');
  });

  it('returns "(untitled)" when matching item has no title', () => {
    const noTitleItems: ContentItem[] = [{ summary: 'This mentions contempt of court finding.' }];
    expect(findMatchSource('contempt of court', noTitleItems)).toBe('(untitled)');
  });
});

describe('generateKeywordCounterEvidence', () => {
  it('returns counter-evidence strings for Capture status', () => {
    const result = generateKeywordCounterEvidence('Capture', 'courts');
    expect(result).toBeInstanceOf(Array);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((s) => typeof s === 'string')).toBe(true);
  });

  it('returns counter-evidence strings for Drift status', () => {
    const result = generateKeywordCounterEvidence('Drift', 'courts');
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((s) => s.includes('reporting'))).toBe(true);
  });

  it('returns counter-evidence strings for Warning status', () => {
    const result = generateKeywordCounterEvidence('Warning', 'courts');
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((s) => s.includes('routine'))).toBe(true);
  });

  it('returns counter-evidence strings for Stable status', () => {
    const result = generateKeywordCounterEvidence('Stable', 'courts');
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((s) => s.includes('absence'))).toBe(true);
  });
});
