import { describe, expect, it } from 'vitest';
import { CATEGORIES } from '@/lib/data/categories';
import {
  componentNameMatchesSlug,
  DOJ_CORPUS_COMPONENTS,
  isCorpusComponent,
} from '@/lib/data/doj-corpus-components';
import { parseDojSignalParams } from '@/lib/services/doj-fetcher';

describe('DOJ corpus components (#892)', () => {
  it('covers every component slug a DOJ signal in categories.ts asks for', () => {
    const signalSlugs = CATEGORIES.flatMap((c) => c.signals)
      .filter((s) => s.type === 'doj_json')
      .map((s) => parseDojSignalParams(s.url).component)
      .filter((slug): slug is string => !!slug);
    expect(signalSlugs.length).toBeGreaterThan(0);
    for (const slug of signalSlugs) expect(DOJ_CORPUS_COMPONENTS).toContain(slug);
  });

  it('matches names the way the signal filter does: hyphens to spaces, case-insensitive', () => {
    expect(componentNameMatchesSlug('Civil Rights Division', 'civil-rights-division')).toBe(true);
    expect(componentNameMatchesSlug('CIVIL RIGHTS DIVISION', 'civil-rights-division')).toBe(true);
    expect(componentNameMatchesSlug('Civil Division', 'civil-rights-division')).toBe(false);
  });

  it('admits leadership-office releases the signals never ask for', () => {
    expect(isCorpusComponent(['Office of the Attorney General'])).toBe(true);
    expect(isCorpusComponent(['Office of the Deputy Attorney General'])).toBe(true);
    expect(isCorpusComponent(['Office of Public Affairs'])).toBe(true);
  });

  it('admits a release when any of its components qualifies', () => {
    expect(
      isCorpusComponent(['U.S. Attorney - Eastern District of Virginia', 'Criminal Division']),
    ).toBe(true);
  });

  it('rejects releases from components outside the corpus list', () => {
    expect(isCorpusComponent(['U.S. Attorney - District of Columbia'])).toBe(false);
    expect(isCorpusComponent(['Antitrust Division', 'Tax Division'])).toBe(false);
    expect(isCorpusComponent([])).toBe(false);
  });
});
