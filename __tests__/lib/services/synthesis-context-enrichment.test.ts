import { describe, expect, it } from 'vitest';
import {
  CHRG_MASTHEAD_RE,
  DISPOSITION_HEADLINE_OPTS,
  dropBoilerplateFragments,
  HEADLINE_OFFSET_ORIGINS,
  headlineSourceSql,
  QUERY_HEADLINE_OPTS,
  trimSeparatorRuns,
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

describe('non-FR mastheads (#744)', () => {
  it('drops a CPD package id + CSS preamble fragment', () => {
    expect(
      dropBoilerplateFragments(
        'DCPD202500412 .s1 {margin:0; font-size: 12pt} h1 {text-align:center}',
      ),
    ).toBeNull();
  });

  it('drops a joint-hearing masthead and a press header', () => {
    expect(
      dropBoilerplateFragments('OVERSIGHT OF DHS [Joint Hearing, 119-12] [From the'),
    ).toBeNull();
    expect(
      dropBoilerplateFragments(
        'For Immediate Release Office of the Press Secretary Contact: 202-282-8010',
      ),
    ).toBeNull();
  });

  it('keeps a body passage that mentions a hearing in prose', () => {
    const body =
      'At the joint hearing the Secretary testified that the reprogramming had been reported to the committees';
    expect(dropBoilerplateFragments(body)).toBe(body);
  });
});

describe('headlineSourceSql (#744)', () => {
  const rendered = () => {
    const chunk = headlineSourceSql(150000) as unknown as {
      queryChunks?: unknown[];
      toQuery?: unknown;
    };
    return JSON.stringify(chunk);
  };

  it('has a masthead branch for every origin the read-time cleaner strips', () => {
    const text = rendered();
    for (const origin of HEADLINE_OFFSET_ORIGINS) {
      expect(text, `no branch for ${origin}`).toContain(`d.source_origin = '${origin}'`);
    }
    expect(HEADLINE_OFFSET_ORIGINS).toEqual([
      'federal_register',
      'govinfo',
      'govinfo_cpd',
      'crec',
      'chrg',
      'dhs_press',
    ]);
  });

  it('keeps the plain LEFT() fallback for every other origin', () => {
    expect(rendered()).toContain('ELSE LEFT(d.content');
  });
});

describe('Postgres regex constraints (#744)', () => {
  it('keeps every bounded repetition at or below the Postgres ARE limit of 255', () => {
    for (const m of CHRG_MASTHEAD_RE.matchAll(/\{(\d+),(\d+)\}/g)) {
      expect(Number(m[2])).toBeLessThanOrEqual(255);
    }
  });

  it('uses no backslash escapes (POSIX classes only) so the template literal cannot mangle it', () => {
    expect(CHRG_MASTHEAD_RE).not.toContain('\\');
  });
});

describe('trimSeparatorRuns (#744)', () => {
  it('strips the GPO rule line a headline window opened on', () => {
    expect(
      dropBoilerplateFragments(
        '------------------------------------------------------- DEPARTMENT OF JUSTICE Drug Enforcement Administration Decision and Order On December 30',
      ),
    ).toBe(
      'DEPARTMENT OF JUSTICE Drug Enforcement Administration Decision and Order On December 30',
    );
    expect(trimSeparatorRuns('====================== VOTER ID ACT _______ July 15, 2026')).toBe(
      'VOTER ID ACT _______ July 15, 2026',
    );
  });

  it('leaves bullets and dashes inside prose alone', () => {
    expect(trimSeparatorRuns('- the order directs agencies — including OPM — to act')).toBe(
      '- the order directs agencies — including OPM — to act',
    );
  });
});
