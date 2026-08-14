import { describe, expect, it } from 'vitest';
import {
  extractQuotedClaims,
  findNearestActual,
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

describe('line-break hyphenation of plain words (#716 v1.9.24)', () => {
  it('matches a quote against a word hyphen-split at a line break', () => {
    const source = normalizeForMatch(
      'funding obligations of the 287(g) program, de- lineated by pay and non-pay requirements and funding source; number of law enforce- ment entities',
    );
    expect(
      quoteAppearsIn(
        'delineated by pay and non-pay requirements and funding source; number of law enforcement entities',
        source,
      ),
    ).toBe(true);
  });
});

describe('boundary punctuation inside quotation marks (#716 v1.9.24)', () => {
  it('matches when the quote carries a trailing comma the document lacks', () => {
    const source = normalizeForMatch(
      'have the explicit authority to assist the Federal Government in our immigration enforcement efforts. Basically,',
    );
    expect(
      quoteAppearsIn(
        'the explicit authority to assist the Federal Government in our immigration enforcement efforts,',
        source,
      ),
    ).toBe(true);
  });

  it('still requires interior punctuation to match', () => {
    const source = normalizeForMatch('the court held, without qualification, that the rule stands');
    expect(quoteAppearsIn('the court held that the rule stands', source)).toBe(false);
  });
});

describe('quoteAppearsIn edge branches', () => {
  it('accepts a quote whose fragments are all below the length floor', () => {
    expect(quoteAppearsIn('a … b', normalizeForMatch('anything'))).toBe(true);
  });

  it('requires ellipsis fragments in order', () => {
    const source = normalizeForMatch('first fragment text then second fragment text');
    expect(quoteAppearsIn('first fragment … second fragment', source)).toBe(true);
    expect(quoteAppearsIn('second fragment … first fragment', source)).toBe(false);
  });
});

describe('extractQuotedClaims branches', () => {
  it('skips sentences without quotes and keeps citation pairing', () => {
    const claims = extractQuotedClaims(
      'Plain sentence. The order says "a quoted passage of real length" [Doc 3]. Short "tiny" one [Doc 4].',
    );
    expect(claims).toEqual([{ quote: 'a quoted passage of real length', citations: [3] }]);
  });
});

describe('quote parity with short quotations (#718 v1.9.27)', () => {
  it('does not extract prose between quotes as a phantom quote', () => {
    const claims = extractQuotedClaims(
      'The speech occurred "last Friday" (January 24, 2025), describing it as a "midnight massacre of independent watchdogs" [Doc 20].',
    );
    expect(claims.map((c) => c.quote)).toEqual(['midnight massacre of independent watchdogs']);
  });

  it('keeps parity across multiple short and long quotes in one sentence', () => {
    const claims = extractQuotedClaims(
      'Described as "acting" and then as having "reported whistleblower allegations to Congress" before "investigating the Secretary of State" [Doc 19].',
    );
    expect(claims.map((c) => c.quote)).toEqual([
      'reported whistleblower allegations to Congress',
      'investigating the Secretary of State',
    ]);
  });
});

describe('abbreviation-proof quote pairing (#718 v1.9.29)', () => {
  it('does not sever quote pairs at abbreviation sentence breaks', () => {
    const claims = extractQuotedClaims(
      'Speakers described Atkinson as having "reported allegations that ultimately led to Mr. Trump’s own impeachment" — and the firing of IG Linick "while investigating the Secretary of State" [Doc 19].',
    );
    expect(claims.map((c) => c.quote)).toEqual([
      'reported allegations that ultimately led to Mr. Trump’s own impeachment',
      'while investigating the Secretary of State',
    ]);
    expect(claims[1]!.citations).toEqual([19]);
  });

  it('leaves the first of two quotes uncited when the citation trails the second', () => {
    // Deliberate: an unbounded fallback attributed other sentences'
    // citations to quoted named entities — exemption beats false alarms.
    const claims = extractQuotedClaims(
      'The order "suspends all entry immediately" and "revokes existing visas today" [Doc 3].',
    );
    expect(claims[0]!.citations).toEqual([]);
    expect(claims[1]!.citations).toEqual([3]);
  });

  it('does not leak citations across a neighboring quote to the left', () => {
    const claims = extractQuotedClaims(
      'First "a fully quoted supported passage" [Doc 2]. Later text about other things, then "a second quoted passage entirely" [Doc 9].',
    );
    expect(claims[0]!.citations).toEqual([2]);
    expect(claims[1]!.citations).toEqual([9]);
  });
});

describe('findNearestActual (#718 v1.9.31)', () => {
  const idByCitation = new Map([[17, 101]]);

  it('locates raw document text despite drift in the first word', () => {
    const rawById = new Map([
      [
        101,
        "under the trump administration, we saw the civil rights division's abdicate its responsibility to enforce many voting rights and other protections",
      ],
    ]);
    const r = findNearestActual(
      'abdicated its responsibility to enforce many voting rights',
      [17],
      idByCitation,
      rawById,
    );
    expect(r?.citation).toBe(17);
    expect(r?.text).toContain('abdicate its responsibility');
  });

  it('anchors on the opening words and returns a raw window with citation', () => {
    const rawById = new Map([
      [
        101,
        'the record shows the only process they are due is the process that Congress has provided. ECF 56',
      ],
    ]);
    const r = findNearestActual(
      'the process they are due is the process that Congress has provided',
      [17],
      idByCitation,
      rawById,
    );
    expect(r?.citation).toBe(17);
    expect(r?.text).toContain('only process they are due');
  });

  it('returns null when the opening words are absent', () => {
    const rawById = new Map([[101, 'entirely unrelated document text goes here']]);
    expect(
      findNearestActual('a quote that appears nowhere at all', [17], idByCitation, rawById),
    ).toBeNull();
  });
});
