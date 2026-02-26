import { describe, expect, it } from 'vitest';
import { parseDojSignalParams, toContentItem } from '@/lib/services/doj-fetcher';

describe('parseDojSignalParams', () => {
  it('extracts component from URL', () => {
    const result = parseDojSignalParams('doj://press?component=criminal-division');
    expect(result.component).toBe('criminal-division');
  });

  it('extracts topic from URL', () => {
    const result = parseDojSignalParams('doj://press?topic=civil+rights');
    expect(result.topic).toBe('civil rights');
  });

  it('extracts both component and topic', () => {
    const result = parseDojSignalParams(
      'doj://press?component=civil-rights-division&topic=housing',
    );
    expect(result.component).toBe('civil-rights-division');
    expect(result.topic).toBe('housing');
  });

  it('returns undefined for missing params', () => {
    const result = parseDojSignalParams('doj://press');
    expect(result.component).toBeUndefined();
    expect(result.topic).toBeUndefined();
  });
});

describe('toContentItem', () => {
  it('maps DOJ API fields correctly', () => {
    const item = toContentItem({
      uuid: 'abc-123',
      title: 'DOJ Announces Settlement',
      body: '<p>The Department of Justice today announced...</p>',
      published_date: '2025-07-01',
      component: 'Civil Division',
      url: '/opa/pr/settlement-announced',
    });

    expect(item.title).toBe('DOJ Announces Settlement');
    expect(item.link).toBe('https://www.justice.gov/opa/pr/settlement-announced');
    expect(item.pubDate).toBe('2025-07-01');
    expect(item.agency).toBe('Civil Division');
    expect(item.summary).toContain('Department of Justice today announced');
    expect(item.type).toBe('press_release');
    expect(item.sourceOrigin).toBe('doj');
  });

  it('prepends justice.gov for relative URLs', () => {
    const item = toContentItem({ url: '/opa/pr/test' });
    expect(item.link).toBe('https://www.justice.gov/opa/pr/test');
  });

  it('preserves absolute URLs', () => {
    const item = toContentItem({ url: 'https://www.justice.gov/full-url' });
    expect(item.link).toBe('https://www.justice.gov/full-url');
  });

  it('handles missing fields gracefully', () => {
    const item = toContentItem({});
    expect(item.title).toBe('(untitled release)');
    expect(item.link).toBeUndefined();
    expect(item.agency).toBe('Department of Justice');
    expect(item.type).toBe('press_release');
    expect(item.sourceOrigin).toBe('doj');
  });

  it('truncates long body text', () => {
    const longBody = '<p>' + 'X'.repeat(1000) + '</p>';
    const item = toContentItem({ body: longBody });
    expect(item.summary!.length).toBeLessThanOrEqual(801);
  });

  it('strips HTML tags from body', () => {
    const item = toContentItem({ body: '<p>Hello <strong>world</strong></p>' });
    expect(item.summary).toBe('Hello world');
  });
});
