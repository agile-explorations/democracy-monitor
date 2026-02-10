import { describe, it, expect } from 'vitest';
import { matchKeyword } from '@/lib/utils/keyword-match';

describe('matchKeyword', () => {
  it('matches an exact keyword', () => {
    expect(matchKeyword('schedule f reclassification', 'schedule f')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(matchKeyword('Executive Order issued today', 'executive order')).toBe(true);
  });

  it('respects word boundaries — rejects substring matches', () => {
    expect(matchKeyword('Massachusetts announced new policy', 'mass')).toBe(false);
  });

  it('matches keyword at start of text', () => {
    expect(matchKeyword('Impoundment of funds was illegal', 'impoundment')).toBe(true);
  });

  it('matches keyword at end of text', () => {
    expect(matchKeyword('The action was an impoundment', 'impoundment')).toBe(true);
  });

  it('handles special regex characters in keywords', () => {
    expect(matchKeyword('price is $100 (estimated)', '$100')).toBe(false); // word boundary won't match $100
  });

  it('rejects when keyword is a substring of a larger word', () => {
    expect(matchKeyword('The reorganization plan was approved', 'organ')).toBe(false);
  });

  it('matches multi-word keyword with word boundaries', () => {
    expect(matchKeyword('They defied court order yesterday', 'defied court order')).toBe(true);
  });

  it('returns false for empty text', () => {
    expect(matchKeyword('', 'keyword')).toBe(false);
  });
});
