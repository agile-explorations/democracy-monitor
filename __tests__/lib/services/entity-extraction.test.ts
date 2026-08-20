import { describe, expect, it } from 'vitest';
import {
  extractEntityPhrases,
  LIGHT_EXTRACTION,
  WIDE_EXTRACTION,
} from '@/lib/services/entity-extraction';

describe('extractEntityPhrases — shared classes (#750)', () => {
  it('extracts case captions mentioned across multiple candidates', () => {
    const texts = [
      'The court in Newsom v. Trump held that the federalization was unlawful.',
      'Following Newsom v. Trump, the Ninth Circuit stayed the order.',
      'Unrelated appropriations text.',
    ];
    const out = extractEntityPhrases(texts, LIGHT_EXTRACTION);
    expect(out[0]).toMatchObject({ phrase: 'Newsom v. Trump', docFreq: 2 });
  });

  it('extracts multi-word captions and executive order numbers', () => {
    const texts = [
      'In United States v. Comey, the indictment was dismissed. Executive Order 14332 directs review.',
      'The dismissal in United States v. Comey turned on 28 U.S.C. 546. Executive Order 14332 applies.',
    ];
    const phrases = extractEntityPhrases(texts, LIGHT_EXTRACTION).map((e) => e.phrase);
    expect(phrases).toContain('United States v. Comey');
    expect(phrases).toContain('Executive Order 14332');
  });

  it('extracts operation names and public laws', () => {
    const texts = [
      'Operation Metro Surge expanded this week under Public Law 119-21.',
      'Members criticized Operation Metro Surge; Public Law 119-21 funded it.',
    ];
    const phrases = extractEntityPhrases(texts, LIGHT_EXTRACTION).map((e) => e.phrase);
    expect(phrases).toContain('Operation Metro Surge');
    expect(phrases).toContain('Public Law 119-21');
  });

  it('counts a phrase once per document regardless of repetition', () => {
    const texts = ['Cook v. Trump. Cook v. Trump. Cook v. Trump.', 'Cook v. Trump again.'];
    expect(extractEntityPhrases(texts, LIGHT_EXTRACTION)[0]).toMatchObject({
      phrase: 'Cook v. Trump',
      docFreq: 2,
    });
  });

  it('merges v. and v spellings case-insensitively', () => {
    const texts = ['NEWSOM V. TRUMP was argued.', 'Newsom v Trump concluded.'];
    const out = extractEntityPhrases(texts, LIGHT_EXTRACTION);
    expect(out).toHaveLength(1);
    expect(out[0].docFreq).toBe(2);
  });

  it('ignores structural false captions', () => {
    const texts = ['See Chapter V. Provisions apply.', 'Chapter V. Provisions again.'];
    expect(extractEntityPhrases(texts, LIGHT_EXTRACTION)).toEqual([]);
  });
});

describe('LIGHT config — v1.10.1 query-time semantics (#758, do not widen: #756)', () => {
  it('drops singletons (a caption seen once is usually its own doc)', () => {
    const texts = ['Only mention of Doe v. Roe here.', 'No captions in this one.'];
    expect(extractEntityPhrases(texts, LIGHT_EXTRACTION)).toEqual([]);
  });

  it('does not extract statutes or person names', () => {
    const texts = [
      'Removals under the Alien Enemies Act. The indictment of James Comey stands.',
      'The Alien Enemies Act again; James Comey was indicted.',
    ];
    expect(extractEntityPhrases(texts, LIGHT_EXTRACTION)).toEqual([]);
  });

  it('is the default config', () => {
    const texts = ['Only mention of Doe v. Roe here.'];
    expect(extractEntityPhrases(texts)).toEqual([]);
  });
});

describe('WIDE config — offline hot-entity sweep (#757)', () => {
  it('extracts named statutes but not generic Act references', () => {
    const texts = [
      'Removals under the Alien Enemies Act were challenged. This Act does not apply here.',
      'The Laken Riley Act of 2025 mandates detention. Under the Act, custody is required.',
    ];
    const phrases = extractEntityPhrases(texts, { ...WIDE_EXTRACTION, minDocFrequency: 1 }).map(
      (e) => e.phrase,
    );
    expect(phrases).toContain('Alien Enemies Act');
    expect(phrases).toContain('Laken Riley Act of 2025');
    expect(phrases.filter((p) => /^(This|The|Such) /.test(p))).toEqual([]);
  });

  it('extracts person names only in legal-action context, with class tags', () => {
    const texts = [
      'The grand jury returned an indictment of James Comey on two counts.',
      'Kilmar Abrego was deported despite a standing order. Sarah Johnson attended the hearing.',
    ];
    const out = extractEntityPhrases(texts, { ...WIDE_EXTRACTION, minDocFrequency: 1 });
    const comey = out.find((e) => e.phrase === 'James Comey');
    expect(comey?.entityClass).toBe('person');
    expect(out.map((e) => e.phrase)).toContain('Kilmar Abrego');
    expect(out.map((e) => e.phrase)).not.toContain('Sarah Johnson');
  });

  it('rejects institutional bigrams and FR-preamble boilerplate statutes', () => {
    const texts = [
      'The investigation by the Justice Department expanded under the Paperwork Reduction Act.',
    ];
    const phrases = extractEntityPhrases(texts, { ...WIDE_EXTRACTION, minDocFrequency: 1 }).map(
      (e) => e.phrase,
    );
    expect(phrases).not.toContain('Justice Department');
    expect(phrases).not.toContain('Paperwork Reduction Act');
  });
});

describe('WIDE config — task forces and initiatives (#760)', () => {
  it('extracts named task forces and initiatives with class tags', () => {
    const texts = [
      'The Memphis Safe Task Force expanded operations. The Civil Rights Fraud Initiative was announced.',
    ];
    const out = extractEntityPhrases(texts, { ...WIDE_EXTRACTION, minDocFrequency: 1 });
    expect(out.find((e) => e.phrase === 'Memphis Safe Task Force')?.entityClass).toBe('task_force');
    expect(out.find((e) => e.phrase === 'Civil Rights Fraud Initiative')?.entityClass).toBe(
      'initiative',
    );
  });

  it('rejects generic or sentence-artifact forms', () => {
    const texts = ['The Task Force met. This Initiative continues under the new plan.'];
    const phrases = extractEntityPhrases(texts, { ...WIDE_EXTRACTION, minDocFrequency: 1 }).map(
      (e) => e.phrase,
    );
    expect(phrases.filter((p) => /Task Force|Initiative/.test(p))).toEqual([]);
  });
});
