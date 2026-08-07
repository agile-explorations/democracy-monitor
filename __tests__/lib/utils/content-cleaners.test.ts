import { describe, it, expect } from 'vitest';
import { stripBoilerplate } from '@/lib/utils/content-cleaners';

describe('stripBoilerplate', () => {
  describe('federal_register — GPO header', () => {
    it('strips GPO header through separator lines', () => {
      const content =
        'Federal Register, Volume 90 Issue 67 (Wednesday, April 9, 2025) ' +
        '[Federal Register Volume 90, Number 67] [Notices] [Pages 15266-15274] ' +
        'From the Federal Register Online via the Government Publishing Office ' +
        '[ www.gpo.gov ] [FR Doc No: 2025-06033] ' +
        '======================================================================= ' +
        '----------------------------------------------------------------------- ' +
        'DEPARTMENT OF HEALTH AND HUMAN SERVICES The actual rule content here.';

      const result = stripBoilerplate(content, 'federal_register');
      expect(result).toBe('DEPARTMENT OF HEALTH AND HUMAN SERVICES The actual rule content here.');
    });

    it('leaves abstract-based FR content unchanged', () => {
      const content =
        'The Environmental Protection Agency (EPA) is proposing to approve revisions...';
      const result = stripBoilerplate(content, 'federal_register');
      expect(result).toBe(content);
    });
  });

  describe('govinfo_cpd — CSS contamination', () => {
    it('strips DCPD prefix and CSS rules', () => {
      const content =
        'DCPD202200955 * {margin:0; padding:0; text-indent:0; } ' +
        '.s1 { color: black; font-family:"Times New Roman"; } ' +
        'h1 { color: black; font-weight: bold; } ' +
        '.p, p { color: black; } ' +
        'Administration of Joseph R. Biden, Jr., 2022 Statement on Juneteenth';

      const result = stripBoilerplate(content, 'govinfo_cpd');
      expect(result).toBe('Administration of Joseph R. Biden, Jr., 2022 Statement on Juneteenth');
    });

    it('leaves clean CPD content unchanged', () => {
      const content =
        'Administration of Donald J. Trump, 2017 Remarks on Signing an Executive Order';
      const result = stripBoilerplate(content, 'govinfo_cpd');
      expect(result).toBe(content);
    });
  });

  describe('govinfo — report header', () => {
    it('strips report header through separator', () => {
      const content =
        'Senate Report 117-183 - NATIONAL PHILADELPHIA NATIONAL HISTORICAL PARK ' +
        '[Senate Report 117-183] [From the U.S. Government Publishing Office] ' +
        'Calendar No. 534 117th Congress } { Report SENATE 2d Session } { 117-183 ' +
        '====================================================================== ' +
        'The committee recommends the passage of this bill.';

      const result = stripBoilerplate(content, 'govinfo');
      expect(result).toBe('The committee recommends the passage of this bill.');
    });

    it('leaves non-report govinfo content unchanged', () => {
      const content = 'PUBLIC LAW 117-328 Some law content here.';
      const result = stripBoilerplate(content, 'govinfo');
      expect(result).toBe(content);
    });
  });

  describe('crec — title repetition', () => {
    it('strips repeated title from content start', () => {
      const title = 'DACA';
      const content =
        'DACA (Ms. JAYAPAL asked and was given permission to address the House for 1 minute.)';
      const result = stripBoilerplate(content, 'crec', title);
      expect(result).toBe(
        '(Ms. JAYAPAL asked and was given permission to address the House for 1 minute.)',
      );
    });

    it('leaves content unchanged when title does not repeat', () => {
      const title = 'Some Other Title';
      const content = 'Mr. Speaker, I rise today to discuss an important matter.';
      const result = stripBoilerplate(content, 'crec', title);
      expect(result).toBe(content);
    });
  });

  describe('passthrough sources', () => {
    it('returns doj content unchanged', () => {
      const content = 'The Department of Justice today announced...';
      expect(stripBoilerplate(content, 'doj')).toBe(content);
    });

    it('returns legiscan content unchanged', () => {
      const content = 'This bill amends the Clean Air Act to...';
      expect(stripBoilerplate(content, 'legiscan')).toBe(content);
    });

    it('returns null source content unchanged', () => {
      const content = 'Some content';
      expect(stripBoilerplate(content, null)).toBe(content);
    });

    it('handles empty content', () => {
      expect(stripBoilerplate('', 'federal_register')).toBe('');
    });
  });
});

describe('chrg front matter (#609)', () => {
  it('strips the GPO hearing header down to the transcript body', () => {
    const raw =
      '- ENFORCEMENT OF THE VOTING RIGHTS ACT IN THE STATE OF TEXAS ' +
      '[House Hearing, 116 Congress] [From the U.S. Government Publishing Office] ' +
      'The subcommittee met, pursuant to call, at 9:30 a.m.';
    const cleaned = stripBoilerplate(raw, 'chrg');
    expect(cleaned).toBe('The subcommittee met, pursuant to call, at 9:30 a.m.');
  });

  it('leaves content without the header untouched', () => {
    const raw = 'The subcommittee met, pursuant to call, at 9:30 a.m.';
    expect(stripBoilerplate(raw, 'chrg')).toBe(raw);
  });
});

describe('dhs_press trailing boilerplate (#678)', () => {
  const substance =
    'GALVESTON, Texas – Ten alleged MS-13 gang members were indicted Aug. 24 by a federal ' +
    'grand jury for various crimes including racketeering conspiracy and murder. ' +
    'The indictment alleges the defendants conspired to murder rival gang members.';

  it('strips a trailing social-media block', () => {
    const raw = `${substance} Follow CBP on X @CBPChicago and @DFOChicago.`;
    expect(stripBoilerplate(raw, 'dhs_press')).toBe(substance.trimEnd());
  });

  it('strips a trailing HSI mission paragraph', () => {
    const raw = `${substance} HSI is the principal investigative arm of the Department of Homeland Security.`;
    expect(stripBoilerplate(raw, 'dhs_press')).toBe(substance.trimEnd());
  });

  it('strips a ### terminator tail', () => {
    const raw = `${substance} ### For media inquiries contact ICE.`;
    expect(stripBoilerplate(raw, 'dhs_press')).toBe(substance.trimEnd());
  });

  it('ignores marker text early in the body', () => {
    const raw = `For media inquiries note: ${substance}`;
    expect(stripBoilerplate(raw, 'dhs_press')).toBe(raw);
  });

  it('leaves clean content untouched', () => {
    expect(stripBoilerplate(substance, 'dhs_press')).toBe(substance);
  });
});
