import { describe, expect, it } from 'vitest';
import {
  buildQuery,
  classifyKey,
  passesTermGate,
  significantTerms,
} from '@/lib/tipwire/coverage-keys';

describe('coverage keys on a web index (#925)', () => {
  it('classifies captions, codes and phrases, and rejects what no index can answer', () => {
    for (const caption of [
      'Douglas v. Veterans Administration',
      'DSCC v. Trump',
      'Streever v Mullin',
    ])
      expect(classifyKey(caption), caption).toBe('caption');
    for (const code of [
      'GAO-26-108106',
      '2026-18061',
      '26-cv-01114',
      'EO 14410',
      'Executive Order 14420',
      '39 of 73 cases',
      'S.J. Res. 213',
      'Civil Action No. 26-2356',
      'courtlistener.com/opinion/10974444',
    ])
      expect(classifyKey(code), code).toBe('code');
    for (const phrase of [
      'DHS whistleblower retaliation timeliness',
      'CISA chemical facility personnel vetting',
      'World Liberty Trust Company',
      'Padilla DHS USCIS voter initiative 2026',
      'Schedule Policy/Career',
      'Liz Oyer',
      'Federal Ballot Mail Portal',
    ])
      expect(classifyKey(phrase), phrase).toBe('phrase');
    for (const bad of [
      'pay freeze',
      'workplace discrimination',
      'inspector general',
      'the',
      'x'.repeat(81),
      'CREC-2026-09-10-pt1-PgS1234',
      'CHRG-119hhrg12345',
    ])
      expect(classifyKey(bad), bad).toBeNull();
  });

  it('quotes captions and codes, leaves phrases ranked loosely', () => {
    expect(buildQuery('GAO-26-108106', 'code')).toBe('"GAO-26-108106"');
    expect(buildQuery(' say "hi" v. them ', 'caption')).toBe('"say hi v. them"');
    expect(buildQuery('DHS whistleblower retaliation timeliness', 'phrase')).toBe(
      'DHS whistleblower retaliation timeliness',
    );
  });

  it('extracts significant terms without stopwords or short tokens', () => {
    expect(significantTerms('S.J. Res. 213')).toEqual(['s.j', 'res', '213']);
    expect(significantTerms('Padilla DHS USCIS voter initiative 2026')).toEqual([
      'padilla',
      'dhs',
      'uscis',
      'voter',
      'initiative',
      '2026',
    ]);
    expect(significantTerms('the World Liberty Trust Company')).toEqual([
      'world',
      'liberty',
      'trust',
      'company',
    ]);
  });

  it('gates unquoted results: half the words, every non-year number, from the 2026-09-24 measurements', () => {
    const dhs = 'DHS whistleblower retaliation timeliness';
    expect(
      passesTermGate(dhs, {
        url: 'https://federalnewsnetwork.com/x',
        title: 'Report finds DHS whistleblower retaliation complaints have spiked',
      }),
    ).toBe(true);
    expect(
      passesTermGate(dhs, {
        url: 'https://for250more.substack.com/x',
        title: 'Oversight Matters – September 22, 2026',
        description: 'A weekly roundup of accountability news.',
      }),
    ).toBe(false);
    // a year is a word, not a mandatory number — 13 relevant NPR/Democracy Docket hits must survive
    expect(
      passesTermGate('Padilla DHS USCIS voter initiative 2026', {
        url: 'https://www.npr.org/x',
        title:
          'Federal agents may have broken state laws in voter fraud hunt, whistleblower claims',
        description: 'Sen. Alex Padilla released a DHS whistleblower report on the initiative.',
      }),
    ).toBe(true);
    // a bare number pulled in journals: the mandatory numeric and word test drops them
    expect(
      passesTermGate('Executive Order 14420 grid', {
        url: 'https://journals.sagepub.com/x',
        title: 'Textile Research Journal',
        description: 'Volume 213',
      }),
    ).toBe(false);
    expect(
      passesTermGate('Executive Order 14420 grid', {
        url: 'https://www.crowell.com/x',
        title: 'Executive Order 14420: Ban on Foreign-Made Electrical Grid Equipment',
      }),
    ).toBe(true);
    expect(passesTermGate('x', { url: 'https://a/b' })).toBe(true);
  });
});
