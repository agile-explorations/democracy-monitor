import { describe, expect, it } from 'vitest';
import {
  applyCitationCorrections,
  extractQuotedClaims,
  findNearestActual,
  isSearchedPhraseQuote,
  normalizeForMatch,
  quoteAppearsIn,
} from '@/lib/services/quote-matching';
import { dedupeMisses, findQuoteElsewhere } from '@/lib/services/quote-verification';

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
    expect(claims).toHaveLength(1);
    expect(claims[0]).toMatchObject({ quote: 'a quoted passage of real length', citations: [3] });
  });
});

describe('citation bracket span for safe rewrites (#720)', () => {
  it('records the bracket span when the pairing window holds exactly one bracket', () => {
    const answer = 'The speech warned of "a political spoils system replacing merit" [Doc 22].';
    const [claim] = extractQuotedClaims(answer);
    expect(claim!.citationSpan).toBeDefined();
    const { start, end } = claim!.citationSpan!;
    expect(answer.slice(start, end)).toBe('[Doc 22]');
  });

  it('omits the span when the window holds multiple brackets', () => {
    const answer =
      'Quoted here: "a political spoils system replacing merit" as stated [Doc 3] and echoed [Doc 7].';
    const [claim] = extractQuotedClaims(answer);
    expect(claim!.citations).toEqual([3, 7]);
    expect(claim!.citationSpan).toBeUndefined();
  });

  it('records a left-window bracket span for citation-before-quote style', () => {
    const answer =
      'According to [Doc 5], the order demands "a political spoils system replacing merit".';
    const [claim] = extractQuotedClaims(answer);
    expect(claim!.citations).toEqual([5]);
    expect(answer.slice(claim!.citationSpan!.start, claim!.citationSpan!.end)).toBe('[Doc 5]');
  });
});

describe('applyCitationCorrections (#720)', () => {
  it('replaces a single bracket in place', () => {
    const answer = 'They vowed to fight "the spoils system" [Doc 22]. More text follows.';
    const span = { start: answer.indexOf('[Doc 22]'), end: answer.indexOf('[Doc 22]') + 8 };
    expect(applyCitationCorrections(answer, [{ span, docs: [25] }])).toBe(
      'They vowed to fight "the spoils system" [Doc 25]. More text follows.',
    );
  });

  it('expands a bracket to the union of original and verbatim sources', () => {
    const answer = 'The memo imposed "Administrative PAYGO," requiring offsets [Doc 4].';
    const span = { start: answer.indexOf('[Doc 4]'), end: answer.indexOf('[Doc 4]') + 7 };
    expect(applyCitationCorrections(answer, [{ span, docs: [4, 6, 12] }])).toBe(
      'The memo imposed "Administrative PAYGO," requiring offsets [Doc 4, Doc 6, Doc 12].',
    );
  });

  it('applies multiple corrections right-to-left so indices stay valid', () => {
    const answer = 'A "first quote" [Doc 1] and a "second quote" [Docs 2, 3] close by.';
    const s1 = { start: answer.indexOf('[Doc 1]'), end: answer.indexOf('[Doc 1]') + 7 };
    const s2 = { start: answer.indexOf('[Docs 2, 3]'), end: answer.indexOf('[Docs 2, 3]') + 11 };
    expect(
      applyCitationCorrections(answer, [
        { span: s1, docs: [9] },
        { span: s2, docs: [12] },
      ]),
    ).toBe('A "first quote" [Doc 9] and a "second quote" [Doc 12] close by.');
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

  it('shares a sentence-final citation across sibling quotes (#721)', () => {
    // The window may cross a SIBLING quote to the sentence end — one bracket
    // legitimately covers both quotes — but never a sentence boundary.
    const claims = extractQuotedClaims(
      'The order "suspends all entry immediately" and "revokes existing visas today" [Doc 3].',
    );
    expect(claims[0]!.citations).toEqual([3]);
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

describe('sentence-scoped pairing windows (#721)', () => {
  it('does not steal a previous sentence’s brackets via the left window', () => {
    // The FW4 false alarm: quote pairs across a sentence boundary to the
    // prior sentence's [Doc 16] [Doc 17] instead of its own sentence-final
    // [Doc 25] beyond the sibling quote.
    const claims = extractQuotedClaims(
      'It renamed the category "Schedule Policy/Career for the record" [Doc 16] [Doc 17]. ' +
        'He described it as part of "unlawful and unconstitutional attacks on workers" and ' +
        'making employees "vulnerable to political purges" [Doc 25].',
    );
    expect(claims.map((c) => c.citations)).toEqual([[16, 17], [25], [25]]);
  });

  it('left window still pairs citation-before-quote within one sentence', () => {
    const claims = extractQuotedClaims(
      'Cited earlier [Doc 7]. Then the chairman said "a quoted passage of real length".',
    );
    expect(claims[0]!.citations).toEqual([]);
  });

  it('sentence-scoped right window enables the bracket span for corrections', () => {
    const answer =
      'He called it part of "unlawful and unconstitutional attacks on workers" and vowed to fight [Doc 25].';
    const [claim] = extractQuotedClaims(answer);
    expect(claim!.citations).toEqual([25]);
    expect(answer.slice(claim!.citationSpan!.start, claim!.citationSpan!.end)).toBe('[Doc 25]');
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

describe('searched-phrase exemption (#718)', () => {
  const chips = ['Schedule F', 'Congressional Response', 'Executive Order 13957'];

  it('exempts a quoted chip despite trailing punctuation and case', () => {
    expect(isSearchedPhraseQuote('Congressional Response,', chips)).toBe(true);
    expect(isSearchedPhraseQuote('congressional response', chips)).toBe(true);
  });

  it('does not exempt real document quotes or chip supersets', () => {
    expect(isSearchedPhraseQuote('replace a competitive merit system', chips)).toBe(false);
    expect(isSearchedPhraseQuote('the Congressional Response to Schedule F', chips)).toBe(false);
  });

  it('never exempts on an empty key or empty chip list', () => {
    expect(isSearchedPhraseQuote('—', chips)).toBe(false);
    expect(isSearchedPhraseQuote('Congressional Response', [])).toBe(false);
  });
});

describe('findQuoteElsewhere (#718)', () => {
  const docs = [
    { citationIndex: 22, id: 101 },
    { citationIndex: 25, id: 102 },
  ];
  const contentById = new Map([
    [101, normalizeForMatch('An executive order creating Schedule F in the excepted service.')],
    [
      102,
      normalizeForMatch(
        'We cannot allow the Trump administration to replace a competitive merit system with a political spoils system.',
      ),
    ],
  ]);

  it('finds a mis-cited quote verbatim in another context document', () => {
    const q = {
      quote: 'replace a competitive merit system with a political spoils system',
      citations: [22],
    };
    expect(findQuoteElsewhere(q, docs, contentById)).toEqual([25]);
  });

  it('skips the quote’s own citations and returns [] when absent', () => {
    const inOwnDoc = { quote: 'creating Schedule F in the excepted service', citations: [22] };
    expect(findQuoteElsewhere(inOwnDoc, docs, contentById)).toEqual([]);
    const nowhere = { quote: 'a phrase found in no document at all', citations: [22] };
    expect(findQuoteElsewhere(nowhere, docs, contentById)).toEqual([]);
  });

  it('returns every containing doc for a term-of-art phrase', () => {
    const multi = new Map([
      [101, normalizeForMatch('The disparate impact doctrine applies here.')],
      [102, normalizeForMatch('Courts revisited the disparate impact doctrine at length.')],
    ]);
    const q = { quote: 'the disparate impact doctrine', citations: [7] };
    const roster = [
      { citationIndex: 7, id: 999 },
      { citationIndex: 1, id: 101 },
      { citationIndex: 2, id: 102 },
    ];
    expect(findQuoteElsewhere(q, roster, multi)).toEqual([1, 2]);
  });
});

describe('CREC page markers in stored text (#718 v1.9.33)', () => {
  it('matches quotes across inline [[Page ...]] interruptions', () => {
    const source = normalizeForMatch(
      'law enforcement officials have the explicit [[Page S3465]] authority to assist the Federal Government',
    );
    expect(quoteAppearsIn('the explicit authority to assist the Federal Government', source)).toBe(
      true,
    );
  });
});

describe('editorial brackets, adjacent brackets, duplicate misses (2026-08-28)', () => {
  it('matches a quote against a source with editorial insertions ("[v]ocalize[d]")', () => {
    const source = normalizeForMatch(
      'Witnesses were asked if this FBI employee had “[v]ocalize[d] support for President Trump.” In addition, [sic] investigators asked about [the] rally.',
    );
    expect(quoteAppearsIn('vocalized support for President Trump', source)).toBe(true);
    expect(quoteAppearsIn('investigators asked about the rally', source)).toBe(true);
  });

  it('pairs a quote with the bracket adjacent to it when the sentence holds two brackets', () => {
    const answer =
      'A member called it a “nakedly political prosecution” [Doc 38] and the committee report [Doc 35] agreed.';
    const [q] = extractQuotedClaims(answer);
    expect(q.citations).toEqual([38, 35]);
    expect(q.citationSpan).toBeDefined();
    expect(answer.slice(q.citationSpan!.start, q.citationSpan!.end)).toBe('[Doc 38]');
  });

  it('records no span when neither bracket is adjacent to the quote', () => {
    const answer =
      'The report described a “nakedly political prosecution” funded federally [Doc 38] and cited [Doc 35].';
    const [q] = extractQuotedClaims(answer);
    expect(q.citationSpan).toBeUndefined();
  });

  it('collapses identical misses into one entry with a count', () => {
    const miss = { quote: 'vocalized support for President Trump', citations: [45] };
    const out = dedupeMisses([
      miss,
      { ...miss },
      { ...miss },
      { quote: 'other phrase here', citations: [45] },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].count).toBe(3);
    expect(out[1].count).toBeUndefined();
  });
});
