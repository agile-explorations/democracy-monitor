import { describe, expect, it } from 'vitest';
import {
  extractEntityPhrases,
  LIGHT_EXTRACTION,
  WIDE_EXTRACTION,
  ENUM_EXTRACTION,
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

describe('caption truncation artifacts (#827)', () => {
  it('rejects captions truncated at an abbreviation period', () => {
    const texts = [
      'In Frengler v. Gen. Motors the claim failed.',
      'The court cited Frengler v. Gen. Motors again.',
    ];
    const phrases = extractEntityPhrases(texts, LIGHT_EXTRACTION).map((e) => e.phrase);
    expect(phrases).toEqual([]);
  });

  it('rejects a caption whose whole left side is a suffix abbreviation', () => {
    const texts = [
      "Nat'l Educ. Ass'n v. Trump was decided.",
      "The ruling in Educ. Ass'n v. Trump stands.",
    ];
    const phrases = extractEntityPhrases(texts, LIGHT_EXTRACTION).map((e) => e.phrase);
    expect(phrases).toEqual([]);
  });

  it('keeps full captions with trailing corporate words and multi-token abbreviated sides', () => {
    const texts = [
      "Noble v. Chrysler Motors Corp and Teachers Ass'n v. Trump were cited.",
      "See Noble v. Chrysler Motors Corp; also Teachers Ass'n v. Trump.",
    ];
    const phrases = extractEntityPhrases(texts, LIGHT_EXTRACTION).map((e) => e.phrase);
    expect(phrases).toContain('Noble v. Chrysler Motors Corp');
    expect(phrases).toContain("Teachers Ass'n v. Trump");
  });
});

describe('second-order artifacts from the first #827 prod dry-run', () => {
  it('rejects sentence-start and document-term person bigrams', () => {
    const texts = [
      'When Judge ruled, the Amended Omnibus was filed; prosecutors charged Individual Supplemental forms per Methodology The report cites.',
      'When Judge considered the Amended Omnibus, investigators charged Individual Supplemental again under Methodology The framework.',
    ];
    const phrases = extractEntityPhrases(texts, WIDE_EXTRACTION).map((e) => e.phrase);
    expect(phrases).not.toContain('When Judge');
    expect(phrases).not.toContain('Methodology The');
    expect(phrases).not.toContain('Amended Omnibus');
    expect(phrases).not.toContain('Individual Supplemental');
  });

  it('folds possessive person mentions into the base name', () => {
    const texts = [
      "Investigators charged Hillary Clinton's aide and later charged Hillary Clinton directly.",
      "The probe that charged Hillary Clinton's team also charged Hillary Clinton again.",
    ];
    const out = extractEntityPhrases(texts, WIDE_EXTRACTION);
    const clinton = out.filter((e) => e.phrase.toLowerCase().startsWith('hillary clinton'));
    expect(clinton).toHaveLength(1);
    expect(clinton[0].phrase).toBe('Hillary Clinton');
  });

  it('rejects possessive-pronoun statute leads', () => {
    const texts = [
      'My Inflation Reduction Act delivered results.',
      'He praised My Inflation Reduction Act again.',
    ];
    const phrases = extractEntityPhrases(texts, WIDE_EXTRACTION).map((e) => e.phrase);
    expect(phrases).not.toContain('My Inflation Reduction Act');
    expect(phrases).toContain('Inflation Reduction Act');
  });
});

describe('person artifact prefixes (#827)', () => {
  it('rejects document-artifact bigrams and keeps real names', () => {
    const texts = [
      'Prosecutors charged Image Jose in the filing; they also charged Maria Gonzalez that week.',
      'The grand jury charged Image Jose again, and later charged Maria Gonzalez too.',
    ];
    const phrases = extractEntityPhrases(texts, WIDE_EXTRACTION).map((e) => e.phrase);
    expect(phrases).not.toContain('Image Jose');
    expect(phrases).toContain('Maria Gonzalez');
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

describe('ENUM_EXTRACTION (#762)', () => {
  const statuteText = [
    'The Insurrection Act of 1807 was invoked. The Laken Riley Act passed.',
    'Debate continued on the Insurrection Act of 1807 and the Laken Riley Act.',
  ];

  it('extracts statutes under enum but not under light', () => {
    const enumPhrases = extractEntityPhrases(statuteText, ENUM_EXTRACTION).map((e) => e.phrase);
    const lightPhrases = extractEntityPhrases(statuteText, {
      ...LIGHT_EXTRACTION,
      minDocFrequency: 1,
    }).map((e) => e.phrase);
    expect(enumPhrases.join(' ')).toMatch(/Insurrection Act/);
    expect(lightPhrases.join(' ')).not.toMatch(/Insurrection Act/);
  });

  it('keeps task forces and persons wide-only', () => {
    const text = ['The Memphis Safe Task Force arrested Defendant John Smith yesterday.'];
    const enumPhrases = extractEntityPhrases(text, { ...ENUM_EXTRACTION, minDocFrequency: 1 }).map(
      (e) => e.phrase,
    );
    expect(enumPhrases.join(' ')).not.toMatch(/Task Force/);
  });

  it('validates-then-slices (config shape)', () => {
    expect(ENUM_EXTRACTION.sliceBeforeValidate).toBe(false);
    expect(ENUM_EXTRACTION.validationCandidates).toBeGreaterThanOrEqual(ENUM_EXTRACTION.maxPhrases);
    expect(LIGHT_EXTRACTION.sliceBeforeValidate).toBe(true);
  });
});
