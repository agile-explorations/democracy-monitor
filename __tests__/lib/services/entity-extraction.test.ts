import { describe, expect, it } from 'vitest';
import { extractEntityPhrases } from '@/lib/services/entity-extraction';

describe('extractEntityPhrases (#750)', () => {
  it('extracts case captions mentioned across multiple candidates', () => {
    const texts = [
      'The court in Newsom v. Trump held that the federalization was unlawful.',
      'Following Newsom v. Trump, the Ninth Circuit stayed the order.',
      'Unrelated appropriations text.',
    ];
    const out = extractEntityPhrases(texts);
    expect(out[0]).toEqual({ phrase: 'Newsom v. Trump', docFreq: 2 });
  });

  it('extracts multi-word captions and executive order numbers', () => {
    const texts = [
      'In United States v. Comey, the indictment was dismissed. Executive Order 14332 directs review.',
      'The dismissal in United States v. Comey turned on 28 U.S.C. 546. Executive Order 14332 applies.',
    ];
    const phrases = extractEntityPhrases(texts).map((e) => e.phrase);
    expect(phrases).toContain('United States v. Comey');
    expect(phrases).toContain('Executive Order 14332');
  });

  it('extracts operation names and public laws', () => {
    const texts = [
      'Operation Metro Surge expanded this week under Public Law 119-21.',
      'Members criticized Operation Metro Surge; Public Law 119-21 funded it.',
    ];
    const phrases = extractEntityPhrases(texts).map((e) => e.phrase);
    expect(phrases).toContain('Operation Metro Surge');
    expect(phrases).toContain('Public Law 119-21');
  });

  it('drops singletons (a caption seen once is usually its own doc)', () => {
    const texts = ['Only mention of Doe v. Roe here.', 'No captions in this one.'];
    expect(extractEntityPhrases(texts)).toEqual([]);
  });

  it('counts a phrase once per document regardless of repetition', () => {
    const texts = ['Cook v. Trump. Cook v. Trump. Cook v. Trump.', 'Cook v. Trump again.'];
    expect(extractEntityPhrases(texts)[0]).toEqual({ phrase: 'Cook v. Trump', docFreq: 2 });
  });

  it('merges v. and v spellings case-insensitively', () => {
    const texts = ['NEWSOM V. TRUMP was argued.', 'Newsom v Trump concluded.'];
    const out = extractEntityPhrases(texts);
    expect(out).toHaveLength(1);
    expect(out[0].docFreq).toBe(2);
  });

  it('ignores structural false captions', () => {
    const texts = ['See Chapter V. Provisions apply.', 'Chapter V. Provisions again.'];
    expect(extractEntityPhrases(texts)).toEqual([]);
  });
});
