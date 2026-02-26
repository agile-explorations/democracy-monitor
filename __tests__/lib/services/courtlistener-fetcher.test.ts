import { describe, expect, it } from 'vitest';
import { parseCourtListenerParams, toContentItem } from '@/lib/services/courtlistener-fetcher';

describe('parseCourtListenerParams', () => {
  it('extracts NOS codes from pseudo-URL', () => {
    const result = parseCourtListenerParams('courtlistener://recap?nos=440');
    expect(result.nos).toBe('440');
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
});

describe('toContentItem', () => {
  it('maps fields correctly', () => {
    const item = toContentItem({
      case_name: 'Smith v. United States',
      absolute_url: '/docket/12345/',
      date_filed: '2025-06-15',
      court: 'D.C. Circuit',
      description: 'Civil rights case',
    });

    expect(item.title).toBe('Smith v. United States');
    expect(item.link).toBe('https://www.courtlistener.com/docket/12345/');
    expect(item.pubDate).toBe('2025-06-15');
    expect(item.agency).toBe('D.C. Circuit');
    expect(item.summary).toBe('Civil rights case');
    expect(item.type).toBe('court_opinion');
    expect(item.sourceOrigin).toBe('courtlistener');
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
    const item = toContentItem({ absolute_url: '/opinion/67890/' });
    expect(item.link).toBe('https://www.courtlistener.com/opinion/67890/');
  });

  it('preserves absolute URLs', () => {
    const item = toContentItem({
      absolute_url: 'https://www.courtlistener.com/docket/99/',
    });
    expect(item.link).toBe('https://www.courtlistener.com/docket/99/');
  });

  it('truncates long descriptions', () => {
    const longDesc = 'A'.repeat(1000);
    const item = toContentItem({ description: longDesc });
    expect(item.summary!.length).toBeLessThanOrEqual(801); // 800 + ellipsis
  });
});
