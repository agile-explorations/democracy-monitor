import { describe, expect, it } from 'vitest';
import {
  allowedNumbersFrom,
  checkEnumerations,
  checkNarrativeNumbers,
  checkNumbers,
  countCategoryTitles,
  countListItems,
  describeViolation,
  extractCountClaims,
  integersIn,
} from '@/lib/services/narrative-number-check';

/** A FACTUAL DATA block shaped like buildFactualSummary's output. */
const FACTUAL = [
  '--- FACTUAL DATA ---',
  'Total categories monitored: 14',
  'Total documents this week: 640',
  'Total documents previous week: 498',
  'Categories Elevated or above: 12 (A, B)',
  '  — at ConfirmedConcern: 9 (…)',
  '  — at Elevated (below ConfirmedConcern): 3 (…)',
  'Categories Stable WITH documents: 2 (Military: 30, Rules: 12)',
  'Categories with ZERO documents: 0',
].join('\n');
const ALLOWED = allowedNumbersFrom(FACTUAL, 14);

describe('extractCountClaims (#700)', () => {
  it('finds counts with their nouns, number words included', () => {
    const claims = extractCountClaims(
      'Six categories are at ConfirmedConcern this week, driven by 640 documents across 14 monitored categories.',
    );
    expect(claims.map((c) => [c.value, c.noun])).toEqual([
      [6, 'categories'],
      [640, 'documents'],
      [14, 'categories'],
    ]);
  });

  it('finds "N of 14 categories" and volume comparisons', () => {
    const claims = extractCountClaims(
      'This week, 12 of 14 monitored categories are Elevated or above, driven by 640 documents (up from 498 the previous week).',
    );
    expect(claims.map((c) => c.value)).toEqual([12, 14, 640, 498]);
    expect(claims[3].kind).toBe('comparison');
  });

  it('ignores dates, years, identifiers and markdown link targets', () => {
    const claims = extractCountClaims(
      'On August 17, 2026 the order (Executive Order 14029, see [the notice](https://x.gov/2026/08/1234)) took effect; week 2026-08-17 followed.',
    );
    expect(claims).toEqual([]);
  });
});

describe('extractCountClaims — what is NOT a claim (#700, tuned on 12 prod weeks)', () => {
  it('skips hedged and subset counts the model made itself', () => {
    const text =
      'Floor speeches are the primary evidence in five of seven elevated categories; the order appears in at least six category narratives; over 1,200 documents were reviewed.';
    // Only "seven elevated categories" is a block-sourced count; the rest is analysis.
    expect(extractCountClaims(text).map((c) => c.value)).toEqual([7]);
  });

  it('skips comparisons that are not about volume or status', () => {
    expect(
      extractCountClaims('the rule compressing BIA appeal deadlines from 30 to 10 days'),
    ).toEqual([]);
  });

  it("skips the model's own cross-category tallies and status-free counts", () => {
    for (const text of [
      'The removal appeared as a concern in six different categories simultaneously.',
      'The settlement surfaces in five categories (Law Enforcement, Following Court Orders) this week.',
      'Whether the five re-elevated categories sustain at ConfirmedConcern is the question to watch.',
    ]) {
      expect(extractCountClaims(text), text).toEqual([]);
    }
  });

  it('skips a from/to pair whose unit follows the second figure', () => {
    expect(
      extractCountClaims('compressing appeal deadlines from 30 to 10 days — raises concerns'),
    ).toEqual([]);
  });

  it('keeps headline "N of 14" counts and volume comparisons', () => {
    const claims = extractCountClaims(
      '7 of 14 monitored categories are elevated — up from 6 last week — based on 957 documents.',
    );
    expect(claims.map((c) => c.value)).toEqual([7, 14, 6, 957]);
  });
});

describe('checkNumbers (#700)', () => {
  it('passes a summary whose figures all come from the block', () => {
    const text =
      'This week, 12 of 14 monitored categories are at Elevated or above — 9 at ConfirmedConcern and 3 at Elevated — driven by 640 documents (up from 498 the previous week).';
    expect(checkNumbers(text, ALLOWED)).toEqual([]);
  });

  it('flags the fabricated 2026-08-03 volume figures', () => {
    const text = 'Total document volume nearly doubled from 492 to 934 documents.';
    const v = checkNumbers(text, ALLOWED);
    expect(v.map((x) => x.value)).toEqual([492, 934]);
    expect(describeViolation(v[1])).toContain('934');
  });

  it('flags a status count that the block does not contain', () => {
    expect(checkNumbers('Six categories are at ConfirmedConcern.', ALLOWED)).toHaveLength(1);
  });

  it('never treats years, dates or non-count nouns as claims', () => {
    expect(
      checkNumbers(
        'Since 2025, 14 categories; on August 17, 2026; 31 days; from July 20 to August 3.',
        ALLOWED,
      ),
    ).toEqual([]);
  });
});

describe('checkEnumerations (#700)', () => {
  it('catches the stored 2026-07-27 miscount: "Four categories" followed by six names', () => {
    const text =
      'Four categories—Independent Agency Rules, Executive Actions, Free and Fair Elections, Civil Rights & Liberties, Federal Law Enforcement, and Immigration Enforcement—are at ConfirmedConcern; Government Worker Protections and Press Freedom are at Elevated.';
    const v = checkEnumerations(text);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ kind: 'enumeration', value: 4, listed: 6 });
  });

  it('catches a count word followed by a parenthesized list of the wrong length', () => {
    const text =
      'Categories at Elevated or above fell to 4, with 1 at ConfirmedConcern (Civil Rights & Liberties) and 2 categories at Elevated (Government Worker Protections, Information Availability, Immigration Enforcement).';
    const v = checkEnumerations(text);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ value: 2, listed: 3 });
  });

  it('catches the stored 2026-07-20 miscount: "Five categories" followed by eight names', () => {
    const text =
      'Five categories (Government Watchdogs, Following Court Orders, Executive Actions, Free and Fair Elections, Civil Rights & Liberties, Federal Law Enforcement, Information Availability, and Immigration Enforcement) are at ConfirmedConcern.';
    expect(checkEnumerations(text)[0]).toMatchObject({ value: 5, listed: 8 });
  });

  it("counts the model's short forms as list items", () => {
    const text =
      'the nominations surface across four categories (Elections, Press Freedom, Law Enforcement, Independent Agency Rules).';
    expect(checkEnumerations(text)).toEqual([]);
  });

  it('does not read a later parenthetical as the list of an earlier count', () => {
    const text =
      'Nine categories are Stable with documents, and two (Political Campaigning Rules, Press Freedom) produced zero documents.';
    expect(checkEnumerations(text)).toEqual([]);
  });

  it('does not end a list at an abbreviation period', () => {
    const text =
      'The 12 activated categories are: Government Worker Protections, Spending Money Congress Approved, Government Watchdogs (Inspectors General), Following Court Orders, Using Military Inside the U.S., Independent Agency Rules, Executive Actions, Information Availability, Free and Fair Elections, Press Freedom, Federal Law Enforcement, and Civil Rights & Liberties. Only two remain Stable.';
    expect(checkEnumerations(text)).toEqual([]);
  });

  it('reads "N of 14 categories — list —" as an enumeration of N, not 14', () => {
    const ok =
      '**Data availability caveat:** 3 of 14 monitored categories — Political Campaigning Rules (Hatch Act), Free and Fair Elections, and Press Freedom — produced zero documents this week.';
    expect(checkEnumerations(ok)).toEqual([]);
    const bad =
      '2 of 14 monitored categories — Political Campaigning Rules (Hatch Act), Free and Fair Elections, and Press Freedom — produced zero documents.';
    expect(checkEnumerations(bad)[0]).toMatchObject({ value: 2, listed: 3 });
  });

  it('is not fooled by a lowercase letter before a sentence-ending period', () => {
    const text =
      'The 12 activated categories are: Government Worker Protections, Spending Money Congress Approved, Government Watchdogs (Inspectors General), Following Court Orders, Using Military Inside the U.S., Independent Agency Rules, Executive Actions, Information Availability, Free and Fair Elections, Federal Law Enforcement, Civil Rights & Liberties, and Immigration Enforcement. The two Stable categories (Political Campaigning Rules (Hatch Act), Press Freedom) both produced documents.';
    expect(checkEnumerations(text)).toEqual([]);
  });

  it('accepts a consistent enumeration and titles containing "and"', () => {
    const text =
      'Two categories that were monitored this week — Political Campaigning Rules (Hatch Act) and Free and Fair Elections — produced no documents at all.';
    expect(checkEnumerations(text)).toEqual([]);
  });

  it('ignores "N categories" followed by prose rather than a list', () => {
    expect(
      checkEnumerations('Four categories — spanning enforcement and oversight — moved this week.'),
    ).toEqual([]);
  });
});

describe('countCategoryTitles / countListItems', () => {
  it('matches base names of titles carrying a parenthetical', () => {
    expect(countCategoryTitles('Political Campaigning Rules and Press Freedom')).toBe(2);
  });

  it('protects titles that contain "and" when splitting', () => {
    expect(
      countListItems('Political Campaigning Rules (Hatch Act) and Free and Fair Elections'),
    ).toBe(2);
    expect(
      countListItems('Elections, Press Freedom, Law Enforcement, and Independent Agency Rules'),
    ).toBe(4);
  });
});

describe('checkNarrativeNumbers — consistent enumerations ground their own count (#700)', () => {
  it('does not hold a partition of the block figure to the block when each part lists its names', () => {
    const text =
      'Three categories (Federal Law Enforcement, Civil Rights & Liberties, Immigration Enforcement) hold at ConfirmedConcern; two others (Independent Agency Rules, Executive Actions) reached ConfirmedConcern this week; and four remain at Elevated (Spending Money Congress Approved, Political Campaigning Rules (Hatch Act), Using Military Inside the U.S., Free and Fair Elections).';
    expect(checkNarrativeNumbers(text, ALLOWED)).toEqual([]);
  });
});

describe('checkNarrativeNumbers + helpers', () => {
  it('combines both checks', () => {
    const text =
      'Six categories—Free and Fair Elections, Spending Money Congress Approved, Press Freedom—are elevated, from 100 to 934 documents.';
    const kinds = checkNarrativeNumbers(text, ALLOWED).map((v) => v.kind);
    expect(kinds).toContain('enumeration');
    expect(kinds).toContain('comparison');
    // The count word heading the bad enumeration is reported once, not twice.
    expect(checkNarrativeNumbers(text, ALLOWED).filter((v) => v.value === 6)).toHaveLength(1);
  });

  it('integersIn reads comma-grouped numbers', () => {
    expect([...integersIn('1,234 docs and 56')]).toEqual([1234, 56]);
  });
});
