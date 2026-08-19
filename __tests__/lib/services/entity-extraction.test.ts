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

  it('keeps singletons (#753 — corpus validation filters what frequency used to)', () => {
    const texts = ['Only mention of Doe v. Roe here.', 'No captions in this one.'];
    expect(extractEntityPhrases(texts)).toEqual([{ phrase: 'Doe v. Roe', docFreq: 1 }]);
  });

  it('extracts named statutes but not generic Act references (#753)', () => {
    const texts = [
      'Removals under the Alien Enemies Act were challenged. This Act does not apply here.',
      'The Laken Riley Act of 2025 mandates detention. Under the Act, custody is required.',
    ];
    const phrases = extractEntityPhrases(texts).map((e) => e.phrase);
    expect(phrases).toContain('Alien Enemies Act');
    expect(phrases).toContain('Laken Riley Act of 2025');
    expect(phrases.filter((p) => /^(This|The|Such) /.test(p))).toEqual([]);
  });

  it('extracts person names only in legal-action context (#753)', () => {
    const texts = [
      'The grand jury returned an indictment of James Comey on two counts.',
      'Kilmar Abrego was deported despite a standing order. Sarah Johnson attended the hearing.',
    ];
    const phrases = extractEntityPhrases(texts).map((e) => e.phrase);
    expect(phrases).toContain('James Comey');
    expect(phrases).toContain('Kilmar Abrego');
    expect(phrases).not.toContain('Sarah Johnson');
  });

  it('rejects institutional bigrams in legal-action context (#753)', () => {
    const texts = ['The investigation by the Justice Department expanded.'];
    expect(extractEntityPhrases(texts).map((e) => e.phrase)).not.toContain('Justice Department');
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
