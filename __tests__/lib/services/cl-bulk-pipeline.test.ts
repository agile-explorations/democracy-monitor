import { describe, it, expect } from 'vitest';
import {
  extractNosCode,
  matchesFirstAmendment,
  parseCsvLine,
  parseHeader,
  routeDocket,
  yearsToDateRanges,
} from '@/lib/services/cl-bulk-pipeline';

describe('extractNosCode', () => {
  it('extracts 3-digit code from CL nature_of_suit', () => {
    expect(extractNosCode('440 Civil rights other')).toBe('440');
    expect(extractNosCode('530 Prisoner petitions - habeas corpus')).toBe('530');
    expect(extractNosCode('890 Other statutory actions')).toBe('890');
  });

  it('returns null for empty or non-numeric input', () => {
    expect(extractNosCode('')).toBeNull();
    expect(extractNosCode('No NOS')).toBeNull();
  });

  it('extracts code even without description', () => {
    expect(extractNosCode('440')).toBe('440');
  });
});

describe('matchesFirstAmendment', () => {
  it('matches when both "first amendment" and a qualifier are present', () => {
    expect(matchesFirstAmendment('First Amendment Violation Case', '')).toBe(true);
    expect(matchesFirstAmendment('Case Name', 'first amendment challenge')).toBe(true);
    expect(matchesFirstAmendment('first amendment', 'injunction granted')).toBe(true);
  });

  it('matches compound qualifiers', () => {
    expect(matchesFirstAmendment('First Amendment Free Speech', '')).toBe(true);
    expect(matchesFirstAmendment('First Amendment Free Press Case', '')).toBe(true);
  });

  it('does not match without "first amendment"', () => {
    expect(matchesFirstAmendment('Free speech violation', '')).toBe(false);
  });

  it('does not match without a qualifier', () => {
    expect(matchesFirstAmendment('First Amendment Case', '')).toBe(false);
    expect(matchesFirstAmendment('First Amendment', 'general case')).toBe(false);
  });

  it('is case-insensitive', () => {
    expect(matchesFirstAmendment('FIRST AMENDMENT VIOLATION', '')).toBe(true);
  });
});

describe('parseCsvLine', () => {
  it('parses simple comma-separated fields', () => {
    expect(parseCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('handles quoted fields with commas', () => {
    expect(parseCsvLine('"hello, world",b,c')).toEqual(['hello, world', 'b', 'c']);
  });

  it('handles escaped quotes inside quoted fields', () => {
    expect(parseCsvLine('"say ""hello""",b')).toEqual(['say "hello"', 'b']);
  });

  it('returns null for empty fields', () => {
    expect(parseCsvLine('a,,c')).toEqual(['a', null, 'c']);
    expect(parseCsvLine(',,')).toEqual([null, null, null]);
  });

  it('returns null for empty quoted fields', () => {
    expect(parseCsvLine('"",b')).toEqual([null, 'b']);
  });

  it('parses a real CL court line', () => {
    const line =
      '"scotus",,,"",,"","2014-10-31","t","t","t","1","SCOTUS","Supreme Court","Supreme Court of the United States","http://supremecourt.gov/","1789-09-24",,"F","",';
    const fields = parseCsvLine(line);
    expect(fields[0]).toBe('scotus');
    expect(fields[17]).toBe('F');
    expect(fields[13]).toBe('Supreme Court of the United States');
  });
});

describe('parseHeader', () => {
  it('builds column index lookup from comma-separated header', () => {
    const header = 'id,name,date_filed,court_id';
    const lookup = parseHeader(header, ['id', 'court_id']);
    expect(lookup.id).toBe(0);
    expect(lookup.name).toBe(1);
    expect(lookup.date_filed).toBe(2);
    expect(lookup.court_id).toBe(3);
  });

  it('throws if required column is missing', () => {
    const header = 'id,name';
    expect(() => parseHeader(header, ['id', 'missing_col'])).toThrow(
      'Required column "missing_col" not found',
    );
  });
});

describe('routeDocket', () => {
  it('routes NOS 440 to both categories', () => {
    const cats = routeDocket('440 Civil rights other', 'Some Case', '');
    expect(cats).toEqual(['lawEnforcement', 'civilLiberties']);
  });

  it('routes NOS 530 to both categories', () => {
    const cats = routeDocket('530 Prisoner petitions - habeas corpus', 'Case', '');
    expect(cats).toEqual(['lawEnforcement', 'civilLiberties']);
  });

  it('routes NOS 890 to lawEnforcement only', () => {
    const cats = routeDocket('890 Other statutory actions', 'Case', '');
    expect(cats).toEqual(['lawEnforcement']);
  });

  it('routes first amendment text match to civilLiberties', () => {
    const cats = routeDocket('999 Unrelated', 'First Amendment Violation', '');
    expect(cats).toEqual(['civilLiberties']);
  });

  it('does not duplicate civilLiberties for NOS 440 + first amendment', () => {
    const cats = routeDocket('440 Civil rights', 'First Amendment Violation', '');
    expect(cats).toEqual(['lawEnforcement', 'civilLiberties']);
    expect(cats.filter((c) => c === 'civilLiberties')).toHaveLength(1);
  });

  it('returns empty for non-matching docket', () => {
    const cats = routeDocket('360 Insurance', 'Insurance claim', '');
    expect(cats).toEqual([]);
  });
});

describe('yearsToDateRanges', () => {
  it('converts years to Jan 20 - Jan 19 presidential year ranges', () => {
    const ranges = yearsToDateRanges([2023]);
    expect(ranges).toEqual([{ start: '2023-01-20', end: '2024-01-19' }]);
  });

  it('handles multiple years', () => {
    const ranges = yearsToDateRanges([2019, 2020]);
    expect(ranges).toHaveLength(2);
    expect(ranges[0]).toEqual({ start: '2019-01-20', end: '2020-01-19' });
    expect(ranges[1]).toEqual({ start: '2020-01-20', end: '2021-01-19' });
  });
});
