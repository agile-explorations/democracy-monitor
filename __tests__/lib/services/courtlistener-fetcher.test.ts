import { describe, expect, it } from 'vitest';
import {
  expandNosParams,
  extractDocketId,
  buildOpinionContentItem,
  parseCourtListenerParams,
  toContentItem,
} from '@/lib/services/courtlistener-fetcher';

describe('parseCourtListenerParams', () => {
  it('extracts NOS codes from pseudo-URL', () => {
    const result = parseCourtListenerParams('courtlistener://recap?nos=440');
    expect(result.nos).toBe('440');
    expect(result.searchType).toBe('r');
  });

  it('extracts multiple NOS codes', () => {
    const result = parseCourtListenerParams('courtlistener://recap?nos=440,530,890');
    expect(result.nos).toBe('440,530,890');
  });

  it('extracts type parameter', () => {
    const result = parseCourtListenerParams('courtlistener://recap?type=opinion');
    expect(result.type).toBe('opinion');
  });

  it('extracts query parameter', () => {
    const result = parseCourtListenerParams('courtlistener://recap?q=first+amendment');
    expect(result.query).toBe('first amendment');
  });

  it('extracts multiple parameters', () => {
    const result = parseCourtListenerParams('courtlistener://recap?nos=440&type=opinion');
    expect(result.nos).toBe('440');
    expect(result.type).toBe('opinion');
  });

  it('returns undefined for missing params', () => {
    const result = parseCourtListenerParams('courtlistener://recap');
    expect(result.nos).toBeUndefined();
    expect(result.type).toBeUndefined();
    expect(result.query).toBeUndefined();
  });

  it('maps recap path to searchType r', () => {
    const result = parseCourtListenerParams('courtlistener://recap?nos=440');
    expect(result.searchType).toBe('r');
  });

  it('maps non-recap path to searchType o', () => {
    const result = parseCourtListenerParams('courtlistener://opinions?q=first+amendment');
    expect(result.searchType).toBe('o');
  });
});

describe('toContentItem', () => {
  it('maps CL V4 search fields correctly', () => {
    const item = toContentItem({
      docket_id: 12345,
      caseName: 'Smith v. United States',
      docket_absolute_url: '/docket/12345/smith-v-united-states/',
      dateFiled: '2025-06-15',
      court: 'D.C. Circuit',
      cause: '42:1983 Civil Rights',
      suitNature: '440 Civil Rights: Other',
      docketNumber: '1:25-cv-00100',
    });

    expect(item.title).toBe('Smith v. United States');
    expect(item.link).toBe('https://www.courtlistener.com/docket/12345/smith-v-united-states/');
    expect(item.pubDate).toBe('2025-06-15');
    expect(item.agency).toBe('D.C. Circuit');
    expect(item.content).toBe('42:1983 Civil Rights');
    expect(item.type).toBe('court_opinion');
    expect(item.sourceOrigin).toBe('courtlistener');
    expect(item.metadata).toEqual({
      docketNumber: '1:25-cv-00100',
      suitNature: '440 Civil Rights: Other',
      caseId: 'cl:12345',
    });
  });

  it('falls back to suitNature when cause is missing', () => {
    const item = toContentItem({ suitNature: '530 Habeas Corpus' });
    expect(item.content).toBe('530 Habeas Corpus');
  });

  it('handles missing optional fields', () => {
    const item = toContentItem({});
    expect(item.title).toBe('(untitled case)');
    expect(item.link).toBeUndefined();
    expect(item.agency).toBe('Federal Court');
    expect(item.type).toBe('court_opinion');
    expect(item.sourceOrigin).toBe('courtlistener');
  });

  it('constructs full URL from relative paths', () => {
    const item = toContentItem({ docket_absolute_url: '/docket/67890/doe-v-roe/' });
    expect(item.link).toBe('https://www.courtlistener.com/docket/67890/doe-v-roe/');
  });

  it('preserves absolute URLs', () => {
    const item = toContentItem({
      docket_absolute_url: 'https://www.courtlistener.com/docket/99/',
    });
    expect(item.link).toBe('https://www.courtlistener.com/docket/99/');
  });

  it('truncates long cause strings', () => {
    const longCause = 'A'.repeat(1000);
    const item = toContentItem({ cause: longCause });
    expect(item.content!.length).toBeLessThanOrEqual(801); // 800 + ellipsis
  });
});

describe('expandNosParams', () => {
  it('returns single-element array for single NOS code', () => {
    const result = expandNosParams({ nos: '440', searchType: 'r' });
    expect(result).toEqual([{ nos: '440', searchType: 'r' }]);
  });

  it('splits comma-separated NOS codes into individual param sets', () => {
    const result = expandNosParams({ nos: '440,530,890', searchType: 'r' });
    expect(result).toHaveLength(3);
    expect(result[0].nos).toBe('440');
    expect(result[1].nos).toBe('530');
    expect(result[2].nos).toBe('890');
    expect(result.every((p) => p.searchType === 'r')).toBe(true);
  });

  it('preserves other params when splitting', () => {
    const result = expandNosParams({ nos: '440,530', query: 'test', searchType: 'r' });
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ nos: '440', query: 'test', searchType: 'r' });
    expect(result[1]).toEqual({ nos: '530', query: 'test', searchType: 'r' });
  });

  it('returns params unchanged when no NOS', () => {
    const params = { query: 'first amendment', searchType: 'o' };
    const result = expandNosParams(params);
    expect(result).toEqual([params]);
  });
});

describe('extractDocketId', () => {
  it('parses docket ID from standard CL docket URL', () => {
    expect(extractDocketId('https://www.courtlistener.com/docket/12345/smith-v-jones/')).toBe(
      12345,
    );
  });

  it('parses docket ID from relative URL', () => {
    expect(extractDocketId('/docket/67890/doe-v-roe/')).toBe(67890);
  });

  it('parses large docket IDs', () => {
    expect(extractDocketId('/docket/99999999/case-name/')).toBe(99999999);
  });

  it('returns null for non-docket URLs', () => {
    expect(extractDocketId('https://www.courtlistener.com/opinion/12345/')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(extractDocketId('')).toBeNull();
  });

  it('returns null for URL without trailing slash', () => {
    expect(extractDocketId('/docket/12345')).toBeNull();
  });
});

describe('buildOpinionContentItem', () => {
  const opinion = {
    text: 'The court hereby rules in favor of the plaintiff...',
    dateFiled: '2025-09-15',
    opinionUrl: 'https://www.courtlistener.com/opinion/54321/smith-v-jones/',
  };

  const parentDocket = {
    caseName: 'Smith v. Jones',
    court: 'D.C. Circuit',
    docketId: 12345,
    suitNature: '440 Civil Rights: Other',
  };

  it('produces correct ContentItem from opinion data', () => {
    const item = buildOpinionContentItem(opinion, parentDocket);

    expect(item.title).toBe('Smith v. Jones');
    expect(item.content).toBe('The court hereby rules in favor of the plaintiff...');
    expect(item.link).toBe('https://www.courtlistener.com/opinion/54321/smith-v-jones/');
    expect(item.pubDate).toBe('2025-09-15');
    expect(item.agency).toBe('D.C. Circuit');
    expect(item.type).toBe('judicial_opinion');
    expect(item.sourceOrigin).toBe('courtlistener');
    expect(item.caseId).toBe('cl:12345');
  });

  it('uses opinion date, not filing date', () => {
    const item = buildOpinionContentItem(opinion, parentDocket);
    expect(item.pubDate).toBe('2025-09-15');
  });

  it('includes caseId and parentDocketUrl in metadata', () => {
    const item = buildOpinionContentItem(opinion, parentDocket);
    expect(item.metadata).toEqual({
      caseId: 'cl:12345',
      suitNature: '440 Civil Rights: Other',
      parentDocketUrl: 'https://www.courtlistener.com/docket/12345/',
    });
  });

  it('handles missing suitNature', () => {
    const item = buildOpinionContentItem(opinion, {
      caseName: 'Doe v. Roe',
      court: '9th Circuit',
      docketId: 99999,
    });
    expect(item.metadata?.suitNature).toBeUndefined();
    expect(item.caseId).toBe('cl:99999');
  });
});
