import { describe, expect, it } from 'vitest';
import { checkTipDates, describeDateViolation } from '@/lib/tipwire/date-guard';
import { parseDatesInText } from '@/lib/utils/date-utils';

describe('parseDatesInText (#931)', () => {
  it('reads month-name dates in every spelling the judge uses, ISO and slash forms', () => {
    const text =
      'Disclosed Sept. 13, 2026; the Record is dated September 14, 2026 (Sep 14, 2026). Filed 09/15/2026, docketed 2026-09-15. Correction Aug. 3rd, 2026.';
    expect(parseDatesInText(text).map((d) => d.iso)).toEqual([
      '2026-09-13',
      '2026-09-14',
      '2026-09-14',
      '2026-08-03',
      '2026-09-15',
      '2026-09-15',
    ]);
    expect(parseDatesInText(text)[0].raw).toBe('Sept. 13, 2026');
  });

  it('takes the default year for a date written without one, and skips it without a default', () => {
    expect(parseDatesInText('a Sept. 13 Senate floor speech', 2026)).toEqual([
      { raw: 'Sept. 13', iso: '2026-09-13' },
    ]);
    expect(parseDatesInText('a Sept. 13 Senate floor speech')).toEqual([]);
  });

  it('ignores fiscal years, bare years, year ranges, lower-case "may 30 days" and impossible dates', () => {
    expect(
      parseDatesInText('FY2018–2025; 2,197 arrests; in 2026; may 30 days; Feb. 30, 2026'),
    ).toEqual([]);
    expect(parseDatesInText('27% loss FY2024–FY2025; $3.8 billion')).toEqual([]);
  });
});

describe('checkTipDates (#931)', () => {
  const record = {
    publishedAt: '2026-09-14',
    sourceOrigin: 'crec',
    text: 'Madam President, on the DHS whistleblower…',
  };

  it('flags the judge\'s "Sept. 13" against a Record dated Sept. 14 — Record dates are exact', () => {
    const v = checkTipDates('A Sept. 13 Senate floor speech disclosed…', [record], {
      defaultYear: 2026,
    });
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({
      raw: 'Sept. 13',
      iso: '2026-09-13',
      nearestPublished: '2026-09-14',
      distanceDays: 1,
    });
    expect(describeDateViolation(v[0])).toBe(
      'tip says "Sept. 13" (2026-09-13); nearest document date is 2026-09-14 (1 day(s) off); no document text mentions it',
    );
    expect(checkTipDates('the September 14, 2026 speech', [record])).toEqual([]);
  });

  it('gives a CourtListener opinion one day of slack — it is filed the day after its date', () => {
    const opinion = { publishedAt: '2026-09-15', sourceOrigin: 'courtlistener', text: '' };
    expect(checkTipDates('decided September 14, 2026', [opinion])).toEqual([]);
    expect(checkTipDates('decided September 13, 2026', [opinion])).toHaveLength(1);
    // an explicit tolerance overrides the per-source rule
    expect(checkTipDates('decided September 13, 2026', [opinion], { toleranceDays: 2 })).toEqual(
      [],
    );
    expect(
      checkTipDates('A Sept. 13 speech', [record], { defaultYear: 2026, toleranceDays: 1 }),
    ).toEqual([]);
  });

  it('accepts a date written inside a matched document even when far from every publication date', () => {
    const docs = [
      {
        publishedAt: '2026-09-05',
        sourceOrigin: 'doj',
        text: 'Operation Rotten Apple ran July 27–August 29, 2026, with 2,197 arrests.',
      },
    ];
    expect(
      checkTipDates('2,197 arrests across New York State, July 27–August 29, 2026', docs),
    ).toEqual([]);
    // the document's own year fills in a tip date written without one
    expect(checkTipDates('the operation that began July 27', docs, { defaultYear: 2026 })).toEqual(
      [],
    );
  });

  it('reports each unsupported date once, with no nearest date when documents are undated', () => {
    const v = checkTipDates('decided March 3, 2024 and again March 3, 2024; then April 9, 2024', [
      { publishedAt: null, text: null },
    ]);
    expect(v.map((x) => x.iso)).toEqual(['2024-03-03', '2024-04-09']);
    expect(describeDateViolation(v[0])).toContain('no matched document carries a date');
  });
});
