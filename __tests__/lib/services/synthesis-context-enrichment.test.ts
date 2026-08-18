import { describe, expect, it } from 'vitest';
import {
  DISPOSITION_HEADLINE_OPTS,
  dropBoilerplateFragments,
  QUERY_HEADLINE_OPTS,
} from '@/lib/services/synthesis-context-enrichment';

/** Postgres deflist syntax: every entry is Key=Value where an empty value
 *  MUST be quoted (""). Unquoted-empty StartSel/StopSel threw on every
 *  enrichment call from v1.9.9 to v1.9.26 — silently, because enrichment
 *  is failure-tolerant (#707, caught 2026-08-14). */
const VALID_DEFLIST_ENTRY = /^\w+=("[^"]*"|[^,\s"]+)$/;

describe('ts_headline options are valid deflists', () => {
  for (const [name, opts] of [
    ['QUERY_HEADLINE_OPTS', QUERY_HEADLINE_OPTS],
    ['DISPOSITION_HEADLINE_OPTS', DISPOSITION_HEADLINE_OPTS],
  ] as const) {
    it(`${name} has no unquoted-empty values`, () => {
      for (const entry of opts.split(',').map((e) => e.trim())) {
        expect(entry, `invalid deflist entry in ${name}: "${entry}"`).toMatch(VALID_DEFLIST_ENTRY);
      }
    });
  }
});

describe('dropBoilerplateFragments (#744)', () => {
  const GPO_HEADER =
    'Federal Register, Volume 90 Issue 153 (Tuesday, August 12, 2025) [Federal Register Volume 90, Number';

  it('drops a masthead-only excerpt entirely (the observed live defect)', () => {
    expect(dropBoilerplateFragments(GPO_HEADER)).toBeNull();
  });

  it('keeps the substantive fragment when only one fragment is masthead', () => {
    const real =
      'directs the Attorney General to investigate whether Federal grant funds are being used to illegally support lobbying activities';
    expect(dropBoilerplateFragments(`${GPO_HEADER} ... ${real}`)).toBe(real);
  });

  it('keeps body passages that merely mention the Federal Register', () => {
    const body =
      'published in the Federal Register on August 29, 2025 (90 FR 42234), and available at the common instructions page';
    expect(dropBoilerplateFragments(body)).toBe(body);
  });

  it('drops hearing and report mastheads', () => {
    expect(
      dropBoilerplateFragments(
        '- NOMINATION OF SCOTT KUPOR [Senate Hearing, 119-43] [From the U.S',
      ),
    ).toBeNull();
  });

  it('drops billing-code tails', () => {
    expect(
      dropBoilerplateFragments(
        '[FR Doc. 2025-21172 Filed 11-25-25; 8:45 am] BILLING CODE 3110-01-P',
      ),
    ).toBeNull();
  });

  it('returns null rather than a too-short residue', () => {
    expect(dropBoilerplateFragments(`${GPO_HEADER} ... short bit`)).toBeNull();
  });
});
