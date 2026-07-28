import { describe, expect, it } from 'vitest';
import { classifyCourtName } from '@/lib/data/court-queries';
import { isInCountingScope } from '@/lib/services/opinion-scope-classifier';

describe('classifyCourtName', () => {
  it('maps SCOTUS exactly', () => {
    expect(classifyCourtName('Supreme Court of the United States')).toBe('scotus');
  });

  it('maps all federal circuit name variants', () => {
    for (const circuit of ['Ninth', 'D.C.', 'Federal', 'First', 'Eleventh']) {
      expect(classifyCourtName(`Court of Appeals for the ${circuit} Circuit`)).toBe('circuit');
    }
  });

  it('maps D.D.C.', () => {
    expect(classifyCourtName('District Court, District of Columbia')).toBe('dcd');
  });

  it('excludes state and local appellate courts', () => {
    expect(classifyCourtName('Ohio Court of Appeals')).toBe('other');
    expect(classifyCourtName('Texas Court of Appeals, 15th District')).toBe('other');
    expect(classifyCourtName('District of Columbia Court of Appeals')).toBe('other');
    expect(classifyCourtName('Supreme Court of Ohio')).toBe('other');
    expect(classifyCourtName('Board of Immigration Appeals')).toBe('other');
  });

  it('treats missing court as other', () => {
    expect(classifyCourtName(null)).toBe('other');
    expect(classifyCourtName(undefined)).toBe('other');
    expect(classifyCourtName('')).toBe('other');
  });
});

describe('isInCountingScope', () => {
  const SCOTUS = 'Supreme Court of the United States';
  const CA9 = 'Court of Appeals for the Ninth Circuit';
  const DCD = 'District Court, District of Columbia';
  const OTHER_DISTRICT = 'District Court, N.D. California';

  it('includes every SCOTUS opinion regardless of text', () => {
    expect(isInCountingScope(SCOTUS, 'Smith v. Jones', 'contract dispute')).toBe(true);
    expect(isInCountingScope(SCOTUS, 'Anything', null)).toBe(true);
  });

  it('includes circuit/DCD opinions on executive-power phrases', () => {
    expect(isInCountingScope(CA9, 'X v. Y', 'The Executive Order at issue...')).toBe(true);
    expect(isInCountingScope(DCD, 'X v. Y', 'raises separation of powers concerns')).toBe(true);
    expect(isInCountingScope(CA9, 'Challenge to removal power of the agency head', null)).toBe(
      true,
    );
  });

  it('excludes circuit opinions without executive-power language', () => {
    expect(isInCountingScope(CA9, 'X v. Y', 'ordinary sentencing appeal')).toBe(false);
  });

  it('does not match executive-power phrases across word boundaries', () => {
    expect(isInCountingScope(CA9, 'X v. Y', 'the executive orders lunch daily')).toBe(false);
    expect(isInCountingScope(CA9, 'X v. Y', 'impoundments of vehicles')).toBe(false);
  });

  it('matches phrases case-insensitively and across whitespace', () => {
    expect(isInCountingScope(DCD, 'X v. Y', 'UNITARY  EXECUTIVE theory')).toBe(true);
  });

  it('excludes non-scope courts even on matching text (counting mirrors collection)', () => {
    expect(isInCountingScope(OTHER_DISTRICT, 'X v. Y', 'executive order challenged')).toBe(false);
    expect(isInCountingScope('Ohio Court of Appeals', 'X v. Y', 'separation of powers')).toBe(
      false,
    );
    expect(isInCountingScope(null, 'X v. Y', 'executive order challenged')).toBe(false);
  });

  it('excludes first-amendment-only matches — that stream is no longer collected', () => {
    expect(isInCountingScope(CA9, 'X v. Y', 'First Amendment retaliation claim')).toBe(false);
    expect(isInCountingScope(OTHER_DISTRICT, 'X v. Y', 'first amendment challenge')).toBe(false);
  });
});
